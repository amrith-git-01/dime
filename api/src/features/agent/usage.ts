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

/** Atomic upsert-increment of the day's totals: one more turn. */
export async function recordUsage(db: Db, userId: string, nowMs: number, usage: Usage): Promise<void> {
  try {
    await run(
      db,
      `INSERT INTO agent_usage (user_id, day, prompt_tokens, completion_tokens, turns, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET
         prompt_tokens = prompt_tokens + excluded.prompt_tokens,
         completion_tokens = completion_tokens + excluded.completion_tokens,
         turns = turns + 1,
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
