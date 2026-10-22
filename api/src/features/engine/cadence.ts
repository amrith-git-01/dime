import { chunks, placeholders, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import { localDate } from '../../core/timezone';
import { DAY_MS, cv, dayNumber, median, mode } from './math';
import type { EngineTxRow } from './types';

export type PayeeKind = 'habit' | 'subscription' | 'income' | 'unknown';

/** Fewest day-separated occurrences a payee needs to have a cadence. */
export const MIN_OCCURRENCES = 3;
/** Intervals this irregular (or worse) give no `next_expected_at`; a debit this irregular is `unknown`. */
export const MAX_REGULAR_INTERVAL_CV = 0.6;
const MAX_SUBSCRIPTION_AMOUNT_CV = 0.1;
/** Interval CV at or below which a pattern counts as steady: a subscription needs it, and a new pattern starts with the stronger Beta(2, 1) prior. */
const STRONG_PRIOR_INTERVAL_CV = 0.3;

/** A payee's cadence as `payee_patterns` stores it (`alpha`/`beta` are the prior for a new row). */
export interface PayeePatternDraft {
  payeeKey: string;
  displayName: string;
  kind: PayeeKind;
  categoryId: string | null;
  /** Occurrence days (several transactions on one local day count once). */
  count: number;
  medianAmount: number;
  medianIntervalDays: number;
  intervalCv: number;
  lastAt: string;
  nextExpectedAt: string | null;
  alpha: number;
  beta: number;
  /** Most common local day of month of the occurrences; not stored (the profile's payday fallback uses it). */
  commonDay: number | null;
}

const isMonthly = (days: number) => days >= 28 && days <= 31;
const isYearly = (days: number) => days >= 358 && days <= 372;

interface Occurrence {
  dayN: number;
  amount: number;
  ms: number;
}

function draftFor(payeeKey: string, type: 'debit' | 'credit', rows: readonly EngineTxRow[], tz: string): PayeePatternDraft | null {
  // One occurrence per local day: two Swiggy orders in an evening are one visit, not an interval of zero.
  const byDay = new Map<number, Occurrence>();
  for (const row of rows) {
    const ms = Date.parse(row.transaction_at);
    if (Number.isNaN(ms)) continue;
    const dayN = dayNumber(tz, ms);
    const hit = byDay.get(dayN);
    if (hit) {
      hit.amount += row.amount;
      hit.ms = Math.max(hit.ms, ms);
    } else {
      byDay.set(dayN, { dayN, amount: row.amount, ms });
    }
  }
  const occurrences = [...byDay.values()].sort((a, b) => a.dayN - b.dayN);
  if (occurrences.length < MIN_OCCURRENCES) return null;

  const intervals = occurrences.slice(1).map((o, i) => o.dayN - (occurrences[i] as Occurrence).dayN);
  const amounts = occurrences.map((o) => o.amount);
  const medianIntervalDays = median(intervals);
  const intervalCv = cv(intervals);
  const regular = intervalCv <= MAX_REGULAR_INTERVAL_CV;

  let kind: PayeeKind;
  if (type === 'credit') kind = 'income';
  else if (
    (isMonthly(medianIntervalDays) || isYearly(medianIntervalDays)) &&
    intervalCv <= STRONG_PRIOR_INTERVAL_CV &&
    cv(amounts) <= MAX_SUBSCRIPTION_AMOUNT_CV
  ) kind = 'subscription';
  else kind = regular ? 'habit' : 'unknown';

  const newest = rows.reduce((a, b) => (Date.parse(b.transaction_at) >= Date.parse(a.transaction_at) ? b : a));
  const lastMs = (occurrences[occurrences.length - 1] as Occurrence).ms;
  const strong = (kind === 'habit' || kind === 'subscription') && intervalCv <= STRONG_PRIOR_INTERVAL_CV;

  return {
    payeeKey,
    displayName: newest.counterparty_name?.trim() || payeeKey,
    kind,
    categoryId: mode(rows.flatMap((r) => (r.category_id ? [r.category_id] : []))),
    count: occurrences.length,
    medianAmount: Math.round(median(amounts)),
    medianIntervalDays,
    intervalCv,
    lastAt: new Date(lastMs).toISOString(),
    nextExpectedAt: regular ? new Date(lastMs + medianIntervalDays * DAY_MS).toISOString() : null,
    alpha: strong ? 2 : 1,
    beta: 1,
    commonDay: mode(occurrences.map((o) => localDate(tz, o.ms).day)),
  };
}

/**
 * Cadence of every payee with at least `MIN_OCCURRENCES` occurrences in `rows` (debits and credits, self
 * transfers excluded). A payee that both paid and was paid keeps whichever side repeats more (one row per payee).
 */
export function detectCadences(rows: readonly EngineTxRow[], tz: string): PayeePatternDraft[] {
  const groups = new Map<string, EngineTxRow[]>();
  for (const row of rows) {
    if (row.counterparty_type === 'self_transfer') continue;
    const key = `${row.type}\u0000${row.payee_key}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const best = new Map<string, PayeePatternDraft>();
  for (const [key, list] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [type, payeeKey] = key.split('\u0000') as ['debit' | 'credit', string];
    const draft = draftFor(payeeKey, type, list, tz);
    if (!draft) continue;
    const other = best.get(payeeKey);
    if (!other || draft.count > other.count) best.set(payeeKey, draft);
  }
  return [...best.values()];
}

/** What `payee_patterns` holds now for a payee (enough to decide whether its row may be dropped). */
export interface ExistingPattern {
  payee_key: string;
  count_120d: number;
  alpha: number;
  beta: number;
  suppressed: number;
  last_scored_expected_at: string | null;
}

/** Still the prior a new pattern starts with, never judged by a hit or a miss: nothing learned that would be lost by deleting the row. */
const isDefaultPrior = (p: ExistingPattern) =>
  p.suppressed === 0 && p.beta === 1 && (p.alpha === 1 || p.alpha === 2) && p.last_scored_expected_at === null;

/**
 * A habit/subscription choice the labeller or the user made (`kind_source` is not 'rule') survives a rebuild while the
 * rule still sees a habit or a subscription; any other new kind (income, unknown) takes over and resets the source.
 * In a conflict upsert `kind` and friends read the row as it was before the update.
 */
const KEEPS_DECIDED_KIND = "(kind_source <> 'rule' AND kind IN ('habit', 'subscription') AND excluded.kind IN ('habit', 'subscription'))";

/**
 * Statements that bring a user's `payee_patterns` in line with `drafts`. A conflict upsert keeps `suppressed` and, unless
 * the payee's kind changed (then its Beta confidence restarts from the new prior), `alpha` and `beta`. A payee that no
 * longer qualifies is deleted, except one the user dismissed or whose confidence was learned: that row is kept as
 * inactive (`count_120d = 0`, no expected date) so a payee that comes back is still dismissed and still trusted.
 */
export function payeePatternStatements(db: Db, userId: string, drafts: readonly PayeePatternDraft[], existing: readonly ExistingPattern[]): D1PreparedStatement[] {
  const keep = new Set(drafts.map((d) => d.payeeKey));
  const stale = existing.filter((p) => !keep.has(p.payee_key));
  const dropped = stale.filter(isDefaultPrior).map((p) => p.payee_key);
  const learned = stale.filter((p) => !isDefaultPrior(p) && p.count_120d > 0).map((p) => p.payee_key);
  return [
    ...chunks(dropped, 90).map((part) =>
      stmt(db, `DELETE FROM payee_patterns WHERE user_id = ? AND payee_key IN (${placeholders(part.length)})`, [userId, ...part]),
    ),
    ...chunks(learned, 90).map((part) =>
      stmt(
        db,
        `UPDATE payee_patterns SET count_120d = 0, next_expected_at = NULL WHERE user_id = ? AND payee_key IN (${placeholders(part.length)})`,
        [userId, ...part],
      ),
    ),
    ...drafts.map((d) =>
      stmt(
        db,
        `INSERT INTO payee_patterns (user_id, payee_key, display_name, kind, category_id, count_120d, median_amount,
           median_interval_days, interval_cv, last_at, next_expected_at, alpha, beta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, payee_key) DO UPDATE SET
           alpha = CASE WHEN suppressed = 0 AND kind <> excluded.kind AND NOT ${KEEPS_DECIDED_KIND} THEN excluded.alpha ELSE alpha END,
           beta = CASE WHEN suppressed = 0 AND kind <> excluded.kind AND NOT ${KEEPS_DECIDED_KIND} THEN excluded.beta ELSE beta END,
           kind_source = CASE WHEN ${KEEPS_DECIDED_KIND} THEN kind_source ELSE 'rule' END,
           kind = CASE WHEN ${KEEPS_DECIDED_KIND} THEN kind ELSE excluded.kind END,
           display_name = excluded.display_name, category_id = excluded.category_id,
           count_120d = excluded.count_120d, median_amount = excluded.median_amount,
           median_interval_days = excluded.median_interval_days, interval_cv = excluded.interval_cv,
           last_at = excluded.last_at, next_expected_at = excluded.next_expected_at`,
        [userId, d.payeeKey, d.displayName, d.kind, d.categoryId, d.count, d.medianAmount, d.medianIntervalDays, d.intervalCv, d.lastAt, d.nextExpectedAt, d.alpha, d.beta],
      ),
    ),
  ];
}
