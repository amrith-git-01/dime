import * as z from 'zod';

import { all, batch, first, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import { dateKey, localDate } from '../../core/timezone';
import type { LlmClient } from '../agent/llm';
import { detectCadences, payeePatternStatements } from './cadence';
import type { ExistingPattern } from './cadence';
import { rollMissedExpectations, scoreExpectations } from './confidence';
import { runLabeller } from './labeller';
import { buildProfile, loadEngineRows, loadFirstTransactionAt, loadIncomeItems, PROFILE_VERSION, resolveTimezone } from './patterns';
import type { EngineMode } from './patterns';
import { nearSnapshotDay, runScoring } from './scoring';
import { DEFAULT_TIMEZONE } from './types';

// Moved to patterns.ts (the backtest script loads it without the queue code); tests and the labeller still import it from here.
export { resolveTimezone };

/** Cron `0 21 * * *` (02:30 IST): fan the engine's nightly run out onto ENGINE_QUEUE, one message per user that needs it. */
export const ENGINE_CRON = '0 21 * * *';

/** A profile older than this is rebuilt even without a write (its windows and expected dates move with the calendar). */
const STALE_DAYS = 7;
/** With the labeller on, a recently built profile past learning mode is rebuilt each night until it has copy for the day. */
const COPY_ACTIVE_DAYS = 30;
const PAGE_SIZE = 500;
/** `Queue.sendBatch` accepts at most 100 messages per call. */
const SEND_BATCH_LIMIT = 100;
const RETRY_DELAY_SECONDS = 60;

export const engineMessageSchema = z.object({ userId: z.string().min(1) });
export type EngineMessage = z.infer<typeof engineMessageSchema>;

export interface EngineRunResult {
  userId: string;
  historyDays: number;
  mode: EngineMode;
  payees: number;
}

/**
 * Rebuilds one user's engine rows from their last 120 days: the profile (`engine_patterns`, dirty cleared) and the
 * payee cadences (`payee_patterns`), written in one batch. Also the inline recompute the forecast route reuses. First it
 * judges the expectations whose window is over (implicit hits and misses, `scoreExpectations`), because the recompute moves
 * their dates. The user's tuned `width_factor` and `window_days` go into the profile and are never overwritten here.
 */
export async function runEngineForUser(env: Pick<Bindings, 'DB'>, userId: string, nowMs: number): Promise<EngineRunResult> {
  const db = env.DB;
  // `dirty_seq` is read before any transaction row: a mark made after this point makes the final write keep `dirty`.
  const [tz, seqRow] = await Promise.all([
    resolveTimezone(db, userId),
    first<{ dirty_seq: number; width_factor: number; window_days: number }>(db, 'SELECT dirty_seq, width_factor, window_days FROM engine_patterns WHERE user_id = ?', [userId]),
  ]);
  const seqAtStart = seqRow?.dirty_seq ?? 0;
  const [rows, firstTransactionAt, incomeItems] = await Promise.all([
    loadEngineRows(db, userId, tz, nowMs),
    loadFirstTransactionAt(db, userId),
    loadIncomeItems(db, userId),
  ]);
  await scoreExpectations(db, userId, tz, nowMs, rows);
  const existing = await all<ExistingPattern>(db, 'SELECT payee_key, count_120d, alpha, beta, suppressed, last_scored_expected_at FROM payee_patterns WHERE user_id = ?', [userId]);

  const cadences = detectCadences(rows, tz);
  rollMissedExpectations(cadences, new Map(existing.map((p) => [p.payee_key, p.last_scored_expected_at])));
  const profile = buildProfile({ rows, firstTransactionAt, incomeItems, cadences, tz, nowMs, windowDays: seqRow?.window_days, widthFactor: seqRow?.width_factor });

  await batch(db, [
    stmt(
      db,
      `INSERT INTO engine_patterns (user_id, version, history_days, profile, dirty, dirty_seq, computed_at) VALUES (?, ?, ?, ?, 0, 0, ?)
       ON CONFLICT (user_id) DO UPDATE SET version = excluded.version, history_days = excluded.history_days,
         profile = excluded.profile, dirty = CASE WHEN dirty_seq = ? THEN 0 ELSE 1 END, computed_at = excluded.computed_at`,
      [userId, PROFILE_VERSION, profile.historyDays, JSON.stringify(profile), profile.computedFrom, seqAtStart],
    ),
    ...payeePatternStatements(db, userId, cadences, existing),
  ]);
  return { userId, historyDays: profile.historyDays, mode: profile.mode, payees: cadences.length };
}

/**
 * Users whose engine rows need a rebuild, in stable order, one page at a time: a profile marked dirty by a write
 * (create, edit or delete), one older than `STALE_DAYS`, and users with transactions but no profile yet. Idle users
 * cost nothing. The last branch probes `transactions` by user (indexed) per user without a profile row. With `copy`
 * (the labeller is on) the second branch adds users whose built, non-learning profile is under 30 days old and has no
 * model-written copy for today, so active users get fresh copy nightly without scanning their transactions. "Today" is
 * the Asia/Kolkata date the 02:30 IST run sees (a copy day is the user's own local date). Around a snapshot day (1, 7, 14
 * or 21, and the Asia/Kolkata day before and after it) the same set (built, non-learning, active in the last 30 days) is
 * queued whatever its state, so every active user gets that day's forecast snapshot in any timezone: the job saves it on
 * the user's own local day and does nothing on the other nights. */
async function* usersToRefreshPages(db: Db, nowMs: number, copy: boolean): AsyncGenerator<string[]> {
  const staleBefore = new Date(nowMs - STALE_DAYS * 86_400_000).toISOString();
  const activeSince = new Date(nowMs - COPY_ACTIVE_DAYS * 86_400_000).toISOString();
  const istToday = localDate(DEFAULT_TIMEZONE, nowMs);
  const today = dateKey(istToday);
  const snapshotDay = nearSnapshotDay(istToday);
  let after = '';
  for (;;) {
    const page = await all<{ user_id: string }>(
      db,
      `SELECT user_id FROM (
         SELECT user_id FROM engine_patterns WHERE user_id > ?1 AND (dirty = 1 OR computed_at < ?2)
         UNION
         SELECT user_id FROM engine_patterns
         WHERE ?6 = 1 AND user_id > ?1 AND version > 0 AND computed_at >= ?4 AND (copy_day IS NULL OR copy_day < ?5)
           AND COALESCE(json_extract(profile, '$.mode'), '') <> 'learning'
         UNION
         SELECT user_id FROM engine_patterns
         WHERE ?7 = 1 AND user_id > ?1 AND version > 0 AND computed_at >= ?4
           AND COALESCE(json_extract(profile, '$.mode'), '') <> 'learning'
         UNION
         SELECT u.id AS user_id FROM users u
         WHERE u.id > ?1
           AND NOT EXISTS (SELECT 1 FROM engine_patterns e WHERE e.user_id = u.id)
           AND EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id AND t.deleted_at IS NULL)
       ) ORDER BY user_id LIMIT ?3`,
      [after, staleBefore, PAGE_SIZE, activeSince, today, copy ? 1 : 0, snapshotDay ? 1 : 0],
    );
    if (page.length === 0) return;
    yield page.map((r) => r.user_id);
    if (page.length < PAGE_SIZE) return;
    after = (page[page.length - 1] as { user_id: string }).user_id;
  }
}

/** Queue one engine job per user that needs a rebuild. Re-running is safe: a job just recomputes. `copy`: the labeller is on. */
export async function fanOutEngine(env: Pick<Bindings, 'DB' | 'ENGINE_QUEUE'>, nowMs: number, options: { copy?: boolean } = {}): Promise<number> {
  let queued = 0;
  for await (const page of usersToRefreshPages(env.DB, nowMs, options.copy === true)) {
    for (let i = 0; i < page.length; i += SEND_BATCH_LIMIT) {
      const messages = page.slice(i, i + SEND_BATCH_LIMIT).map((userId) => ({ body: { userId } satisfies EngineMessage }));
      await env.ENGINE_QUEUE.sendBatch(messages);
      queued += messages.length;
    }
  }
  log.info('engine_fanout', { queued });
  return queued;
}

/**
 * `queue()` handler for `dime-engine`: rebuild the user's rows, score and snapshot the forecast (`runScoring`), then run the
 * DeepSeek labeller on them, and ack. A failed rebuild is retried (the queue's retry budget then dead-letters it); a failed
 * scoring or labeller is not (neither throws; the next night tries again, and the forecast keeps its code templates). `llm` replaces the DeepSeek client in tests.
 */
export async function handleEngineBatch(batch: MessageBatch<unknown>, env: Bindings, llm?: LlmClient): Promise<void> {
  const nowMs = Date.now();
  await Promise.all(
    batch.messages.map(async (message) => {
      const parsed = engineMessageSchema.safeParse(message.body);
      if (!parsed.success) {
        log.error('engine_message_invalid', { messageId: message.id });
        message.ack(); // retrying a malformed message can never help
        return;
      }
      try {
        const result = await runEngineForUser(env, parsed.data.userId, nowMs);
        const scoring = await runScoring(env, parsed.data.userId, nowMs);
        const labeller = await runLabeller(env, parsed.data.userId, nowMs, llm);
        log.info('engine_user_done', { ...result, scoring, labeller: labeller.status, labellerTokens: labeller.tokens });
        message.ack();
      } catch (err) {
        log.warn('engine_user_failed', { userId: parsed.data.userId, attempt: message.attempts, err });
        message.retry({ delaySeconds: RETRY_DELAY_SECONDS });
      }
    }),
  );
}

/** `queue()` handler for `dime-engine-dlq`: a user the queue gave up on. Log and ack; the next night tries again. */
export function handleEngineDlq(batch: MessageBatch<unknown>): void {
  for (const message of batch.messages) {
    const parsed = engineMessageSchema.safeParse(message.body);
    log.error('engine_user_dead_lettered', { messageId: message.id, userId: parsed.success ? parsed.data.userId : undefined, attempts: message.attempts });
  }
  batch.ackAll();
}
