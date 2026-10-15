import { first, newId, nowIso, run } from '../../core/db';
import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import type { Usage } from './llm';

/**
 * Daily token budget (table `agent_usage`, one row per user and UTC day) and thumbs feedback
 * (`agent_feedback`), both always scoped by the JWT user id.
 * The budget is a cost guard, not a ledger: a failing read fails OPEN (the turn runs) and a failing
 * write is logged.
 */

const utcDay = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);

interface UsageRow {
  prompt_tokens: number | string;
  completion_tokens: number | string;
}

/** Tokens (prompt + completion) the user spent today, or null when the table could not be read. */
export async function tokensUsedToday(db: Db, userId: string, nowMs: number): Promise<number | null> {
  try {
    const data = await first<UsageRow>(
      db,
      'SELECT prompt_tokens, completion_tokens FROM agent_usage WHERE user_id = ? AND day = ?',
      [userId, utcDay(nowMs)],
    );
    return data ? Number(data.prompt_tokens) + Number(data.completion_tokens) : 0;
  } catch (err) {
    log.warn('agent_usage_read_failed', { err: String(err) });
    return null;
  }
}

/** Seconds until the next UTC midnight (when the daily question count resets). */
export function secondsToUtcMidnight(nowMs: number): number {
  const next = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - nowMs) / 1000));
}

/**
 * Counts one question for today, atomically: the upsert only increments while `turns < limit`, so
 * concurrent requests cannot exceed it. `false` = the limit is used up. A failing write fails OPEN
 * (the turn runs), like the token budget.
 */
export async function claimQuestion(db: Db, userId: string, nowMs: number, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  try {
    const row = await first<{ turns: number }>(
      db,
      `INSERT INTO agent_usage (user_id, day, turns, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET turns = turns + 1, updated_at = excluded.updated_at
       WHERE turns < ?
       RETURNING turns`,
      [userId, utcDay(nowMs), nowIso(), limit],
    );
    return row !== null;
  } catch (err) {
    log.warn('agent_usage_claim_failed', { err: String(err) });
    return true;
  }
}

/**
 * Gives back a question claimed by `claimQuestion` when the turn failed without an answer (model or
 * network error, timeout, client gone). `claimedAtMs` is the claim time, so a turn that crosses UTC
 * midnight refunds the day it was charged to. Never below zero; failures are logged, not thrown.
 */
export async function refundQuestion(db: Db, userId: string, claimedAtMs: number): Promise<void> {
  try {
    await run(
      db,
      `UPDATE agent_usage SET turns = turns - 1, updated_at = ? WHERE user_id = ? AND day = ? AND turns > 0`,
      [nowIso(), userId, utcDay(claimedAtMs)],
    );
  } catch (err) {
    log.warn('agent_usage_refund_failed', { err: String(err) });
  }
}

/** Atomic upsert-increment of the day's token totals (the question itself was counted by `claimQuestion`). */
export async function recordUsage(db: Db, userId: string, nowMs: number, usage: Usage): Promise<void> {
  try {
    await run(
      db,
      `INSERT INTO agent_usage (user_id, day, prompt_tokens, completion_tokens, turns, updated_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET
         prompt_tokens = prompt_tokens + excluded.prompt_tokens,
         completion_tokens = completion_tokens + excluded.completion_tokens,
         updated_at = excluded.updated_at`,
      [userId, utcDay(nowMs), Math.max(usage.promptTokens || 0, 0), Math.max(usage.completionTokens || 0, 0), nowIso()],
    );
  } catch (err) {
    log.warn('agent_usage_write_failed', { err });
  }
}

/** One rating per (user, turn): rating again replaces the previous one. */
export async function saveFeedback(
  db: Db,
  userId: string,
  input: { turnId: string; rating: 'up' | 'down'; comment: string | null },
): Promise<void> {
  await run(
    db,
    `INSERT INTO agent_feedback (id, user_id, turn_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, turn_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment`,
    [newId(), userId, input.turnId, input.rating, input.comment, nowIso()],
  );
}
