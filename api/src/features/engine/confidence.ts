import { all, batch, chunks, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { DAY_MS, dayNumber } from './math';
import type { PayeePatternDraft } from './cadence';
import type { EngineTxRow } from './types';

/** Confidence of a repeating-payee prediction: the mean of its Beta(alpha, beta) (docs/PREDICTIVE-ENGINE-PLAN.md §6.1). */
export const confidenceOf = (alpha: number, beta: number): number => (alpha + beta > 0 ? alpha / (alpha + beta) : 0);

/** Below this a prediction is hidden; it comes back once hits raise the confidence again. */
export const MIN_CONFIDENCE = 0.4;
/** A likely spend is only shown from this confidence on. */
export const LIKELY_CONFIDENCE = 0.6;

/** A "Yes, that's right" on a prediction adds this much to alpha (docs/PREDICTIVE-ENGINE-PLAN.md §6.1). */
export const CONFIRM_BOOST = 3;
/** Old evidence fades: before each new hit, miss or boost alpha and beta are multiplied by this, so a payee that changed can lose trust. */
export const EVIDENCE_DECAY = 0.9;
/** Alpha + beta never exceeds this (both are scaled down together), so even a long record is overturned in a handful of misses. */
export const MAX_EVIDENCE = 20;

/** New Beta parameters after `hit` hits and `miss` misses (or a boost as hits): decay first, add, then cap the total. */
export function updateEvidence(alpha: number, beta: number, hit: number, miss: number): { alpha: number; beta: number } {
  let a = alpha * EVIDENCE_DECAY + hit;
  let b = beta * EVIDENCE_DECAY + miss;
  const total = a + b;
  if (total > MAX_EVIDENCE) {
    a *= MAX_EVIDENCE / total;
    b *= MAX_EVIDENCE / total;
  }
  return { alpha: Math.round(a * 10_000) / 10_000, beta: Math.round(b * 10_000) / 10_000 };
}

/** A predicted spend counts as happened when it lands within this many days of its expected date. */
export const HIT_WINDOW_DAYS = 2;
/** At most this many past expectations of one payee are judged in one run (the rest follow on the next nights). */
const MAX_CATCH_UP = 8;

/**
 * Implicit feedback: judges every habit/subscription expectation whose window (expected date +-2 days) is over. A debit of
 * the payee inside the window, after the occurrence the date was derived from, is a hit (alpha + 1); none is a miss
 * (beta + 1), each after the old evidence has decayed (`updateEvidence`). `last_scored_expected_at` remembers the date
 * judged, so an expectation counts once; the recompute then moves a missed date on by one interval
 * (`rollMissedExpectations`), so a payee that stays away keeps missing. Run before the cadences are recomputed (they move
 * `next_expected_at`), with the rows the run loaded (payee merges applied). Returns how many expectations were judged.
 */
export async function scoreExpectations(db: Db, userId: string, tz: string, nowMs: number, rows: readonly EngineTxRow[]): Promise<number> {
  const due = await all<{ payee_key: string; next_expected_at: string; last_at: string; median_interval_days: number | null; alpha: number; beta: number }>(
    db,
    `SELECT payee_key, next_expected_at, last_at, median_interval_days, alpha, beta FROM payee_patterns
     WHERE user_id = ? AND kind IN ('habit', 'subscription') AND suppressed = 0 AND count_120d > 0
       AND next_expected_at IS NOT NULL AND last_scored_expected_at IS NOT next_expected_at`,
    [userId],
  );
  if (due.length === 0) return 0;
  const todayN = dayNumber(tz, nowMs);
  const daysOf = new Map<string, number[]>();
  for (const row of rows) {
    if (row.type !== 'debit' || row.counterparty_type === 'self_transfer') continue;
    const ms = Date.parse(row.transaction_at);
    if (Number.isNaN(ms)) continue;
    const list = daysOf.get(row.payee_key);
    if (list) list.push(dayNumber(tz, ms));
    else daysOf.set(row.payee_key, [dayNumber(tz, ms)]);
  }

  const statements: D1PreparedStatement[] = [];
  for (const p of due) {
    const lastN = dayNumber(tz, Date.parse(p.last_at));
    const step = (p.median_interval_days ?? 0) * DAY_MS;
    const days = daysOf.get(p.payee_key) ?? [];
    let { alpha, beta } = p;
    let expectedMs = Date.parse(p.next_expected_at);
    let judgedMs: number | null = null;
    // Every expectation whose window is over, one interval apart: a payee away for weeks is judged for each date it missed, in this
    // run, so a second run the same night (a tuning rebuild) finds nothing left to judge.
    for (let i = 0; i < MAX_CATCH_UP && !Number.isNaN(expectedMs); i++) {
      const expectedN = dayNumber(tz, expectedMs);
      if (expectedN + HIT_WINDOW_DAYS >= todayN) break; // the window is still open
      const hit = days.some((d) => d > lastN && Math.abs(d - expectedN) <= HIT_WINDOW_DAYS);
      ({ alpha, beta } = updateEvidence(alpha, beta, hit ? 1 : 0, hit ? 0 : 1));
      judgedMs = expectedMs;
      if (step <= 0) break;
      expectedMs += step;
    }
    if (judgedMs === null) continue;
    statements.push(
      stmt(
        db,
        `UPDATE payee_patterns SET alpha = ?, beta = ?, last_scored_expected_at = ?
         WHERE user_id = ? AND payee_key = ? AND next_expected_at = ?`,
        [alpha, beta, new Date(judgedMs).toISOString(), userId, p.payee_key, p.next_expected_at],
      ),
    );
  }
  for (const part of chunks(statements, 50)) await batch(db, part);
  return statements.length;
}

/**
 * A date that was already judged is over: move a draft's `nextExpectedAt` on by whole intervals until it is after it. Without
 * this a payee that never pays again keeps the same (missed) date and is only ever missed once. `judged` maps payee_key to
 * `last_scored_expected_at`.
 */
export function rollMissedExpectations(drafts: readonly PayeePatternDraft[], judged: ReadonlyMap<string, string | null>): void {
  for (const d of drafts) {
    const scored = judged.get(d.payeeKey);
    if (!d.nextExpectedAt || !scored || d.medianIntervalDays <= 0) continue;
    const step = d.medianIntervalDays * DAY_MS;
    const gap = Date.parse(scored) - Date.parse(d.nextExpectedAt);
    if (Number.isNaN(gap) || gap < 0) continue;
    d.nextExpectedAt = new Date(Date.parse(d.nextExpectedAt) + (Math.floor(gap / step) + 1) * step).toISOString();
  }
}
