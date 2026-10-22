import { all, first } from '../../core/db';
import type { Db } from '../../core/db';
import { addDays, localDate, parseTimezone, startOfLocalDay } from '../../core/timezone';
import { UNCATEGORIZED_KEY } from '../transactions/aggregates';
import type { PayeePatternDraft } from './cadence';
import { DAY_MS, dayNumber, mad, median, weekdayOf } from './math';
import { DEFAULT_TIMEZONE, LOOKBACK_DAYS } from './types';
import type { EngineTxRow } from './types';

/** Profile format version stored in `engine_patterns.version`. */
export const PROFILE_VERSION = 1;
/** Default baseline window; self-scoring tunes it to 60, 90 or 120 days per user later. */
export const DEFAULT_WINDOW_DAYS = 90;
/** Fewer days of history than this: the forecast is budget-only. */
export const LEARNING_DAYS = 14;
/** Fewer days of history than this: the forecast runs with wider ranges. */
export const WARMING_DAYS = 30;
export const HISTORY_CAP_DAYS = 365;
/** Median interval (days) of a monthly credit cadence. */
const MONTHLY_INTERVAL = [25, 35] as const;

export type EngineMode = 'learning' | 'warming' | 'full';

export interface CategoryBaseline {
  /** Flexible spend of each complete month in `EngineProfile.months`, paise (0 for a month without any). */
  monthlyTotals: number[];
  median: number;
  mad: number;
}

/** `engine_patterns.profile` (JSON). Everything the per-request forecast needs besides this month's rows. */
export interface EngineProfile {
  version: typeof PROFILE_VERSION;
  timezone: string;
  windowDays: number;
  historyDays: number;
  mode: EngineMode;
  /** Index 0 = Sunday ... 6 = Saturday: daily flexible totals (paise, zero days included), oldest first, and their median. */
  weekday: Array<{ values: number[]; median: number }>;
  overallDailyMedian: number;
  /** `YYYY-MM` of the complete months the category baselines cover, oldest first. */
  months: string[];
  /** Keyed by category id (`UNCATEGORIZED_KEY` for none). */
  categories: Record<string, CategoryBaseline>;
  /** Day of month the main income arrives, if known. */
  payday: number | null;
  /** Multiplier on forecast ranges (tuned by self-scoring; 1 until then). */
  widthFactor: number;
  computedFrom: string;
}

export interface RecurringIncomeItem {
  amount: number;
  day_of_month: number;
}

/** Flexible spend: a debit that is not a posted bill, a self transfer, a fixed-category spend or labelled one-off. */
export function isFlexibleSpend(row: EngineTxRow): boolean {
  return (
    row.type === 'debit' &&
    row.recurring_item_id === null &&
    row.counterparty_type !== 'self_transfer' &&
    row.scope === 'spend' &&
    row.one_off !== 1
  );
}

/**
 * What a month "spent": every debit in it (bills, self transfers and one-offs included), the month summary's debit total. The
 * forecast's `spentSoFar` and the month-end `actual` of a snapshot both come from here, so a forecast is scored on the number it forecast.
 */
export const spentCents = (summary: { debitCents: number }): number => summary.debitCents;

export interface MonthFlexSums {
  /** Flexible spend in the month so far, paise. */
  flexibleSpentSoFar: number;
  /** The flexible spend of `todayN`. */
  flexibleSpentToday: number;
  /** Every debit of `todayN` (fixed and flexible). */
  spentToday: number;
  /** Flexible spend of the month so far by category id (`UNCATEGORIZED_KEY` for none). */
  flexByCategory: Map<string, number>;
}

/**
 * This month's flexible spend (the profile's definition) in total, today and per category, from the rows in the month
 * range `[from, to)`. The forecast request and the as-of replays (`backtest.ts`) share it so they cannot drift apart.
 */
export function monthFlexSums(rows: readonly EngineTxRow[], tz: string, range: { from: string; to: string }, todayN: number): MonthFlexSums {
  const sums: MonthFlexSums = { flexibleSpentSoFar: 0, flexibleSpentToday: 0, spentToday: 0, flexByCategory: new Map() };
  for (const row of rows) {
    if (row.transaction_at < range.from || row.transaction_at >= range.to) continue;
    const isToday = dayNumber(tz, Date.parse(row.transaction_at)) === todayN;
    if (row.type === 'debit' && isToday) sums.spentToday += row.amount;
    if (!isFlexibleSpend(row)) continue;
    sums.flexibleSpentSoFar += row.amount;
    if (isToday) sums.flexibleSpentToday += row.amount;
    const key = row.category_id?.toLowerCase() ?? UNCATEGORIZED_KEY;
    sums.flexByCategory.set(key, (sums.flexByCategory.get(key) ?? 0) + row.amount);
  }
  return sums;
}

/** Complete months the category's rest-of-month usual needs (`categoryRestOfMonth`). */
export const MIN_REST_MONTHS = 2;

/**
 * Each category's usual flexible spend for the rest of a month: for every complete month in `months` (`YYYY-MM`, as the
 * profile lists them) the category's flexible spend on the days after `todayDay` (clamped to that month's length), then
 * the median over the months (a month without any counts as 0). A category that is paid early in the month (rent, a
 * monthly bill) therefore expects nothing more once it has been paid. Empty with fewer than `MIN_REST_MONTHS` months, and
 * only categories with flexible spend in those months are listed; the caller falls back to the category's share for the rest.
 * Keys are category ids (`UNCATEGORIZED_KEY` for none).
 */
export function categoryRestOfMonth(rows: readonly EngineTxRow[], tz: string, months: readonly string[], todayDay: number): Map<string, number> {
  if (months.length < MIN_REST_MONTHS) return new Map();
  const perMonth = new Map<string, Map<string, number>>(months.map((m) => [m, new Map<string, number>()]));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isFlexibleSpend(row)) continue;
    const ms = Date.parse(row.transaction_at);
    if (Number.isNaN(ms)) continue;
    const { year, month, day } = localDate(tz, ms);
    const key = monthKey(year, month);
    const sums = perMonth.get(key);
    if (!sums) continue;
    const category = row.category_id?.toLowerCase() ?? UNCATEGORIZED_KEY;
    seen.add(category);
    if (day > Math.min(todayDay, new Date(Date.UTC(year, month, 0)).getUTCDate())) sums.set(category, (sums.get(category) ?? 0) + row.amount);
  }
  return new Map([...seen].map((id) => [id, median(months.map((m) => perMonth.get(m)?.get(id) ?? 0))]));
}

export const modeForHistory = (historyDays: number): EngineMode =>
  historyDays < LEARNING_DAYS ? 'learning' : historyDays < WARMING_DAYS ? 'warming' : 'full';

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Day of month of the main income: the largest active recurring income, else the largest monthly-cadence credit payee. */
function findPayday(incomeItems: readonly RecurringIncomeItem[], cadences: readonly PayeePatternDraft[]): number | null {
  const item = [...incomeItems].sort((a, b) => b.amount - a.amount)[0];
  if (item) return item.day_of_month;
  const monthly = cadences
    .filter((c) => c.kind === 'income' && c.medianIntervalDays >= MONTHLY_INTERVAL[0] && c.medianIntervalDays <= MONTHLY_INTERVAL[1])
    .sort((a, b) => b.medianAmount - a.medianAmount)[0];
  return monthly?.commonDay ?? null;
}

export interface ProfileInput {
  /** Transactions of the last `LOOKBACK_DAYS` days, up to now. */
  rows: readonly EngineTxRow[];
  /** Instant of the user's oldest non-deleted transaction, if any (may be older than the loaded rows). */
  firstTransactionAt: string | null;
  incomeItems: readonly RecurringIncomeItem[];
  /** Cadences already detected from `rows` (for the payday fallback). */
  cadences: readonly PayeePatternDraft[];
  tz: string;
  nowMs: number;
  windowDays?: number;
  widthFactor?: number;
}

/**
 * The per-user profile: weekday baselines and category baselines of flexible spend. Only complete local days
 * count (today is still in progress), and days before the user's first transaction are not zero days.
 */
export function buildProfile(input: ProfileInput): EngineProfile {
  const { rows, tz, nowMs } = input;
  const windowDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const todayN = dayNumber(tz, nowMs);
  const firstN = input.firstTransactionAt ? Math.min(dayNumber(tz, Date.parse(input.firstTransactionAt)), todayN) : todayN;
  const historyDays = Math.min(todayN - firstN, HISTORY_CAP_DAYS);

  // Flexible spend per complete local day and per (month, category).
  const dayTotals = new Map<number, number>();
  const monthTotals = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!isFlexibleSpend(row)) continue;
    const ms = Date.parse(row.transaction_at);
    if (Number.isNaN(ms)) continue;
    const dayN = dayNumber(tz, ms);
    if (dayN >= todayN) continue;
    dayTotals.set(dayN, (dayTotals.get(dayN) ?? 0) + row.amount);
    const { year, month } = localDate(tz, ms);
    const key = monthKey(year, month);
    const perCategory = monthTotals.get(key) ?? new Map<string, number>();
    const category = row.category_id?.toLowerCase() ?? UNCATEGORIZED_KEY;
    perCategory.set(category, (perCategory.get(category) ?? 0) + row.amount);
    monthTotals.set(key, perCategory);
  }

  const weekdayValues: number[][] = Array.from({ length: 7 }, () => []);
  const allDays: number[] = [];
  for (let n = Math.max(todayN - windowDays, firstN); n < todayN; n++) {
    const total = dayTotals.get(n) ?? 0;
    (weekdayValues[weekdayOf(n)] as number[]).push(total);
    allDays.push(total);
  }

  // Complete past months only: the whole month lies inside the loaded rows and after the user's first day.
  const months: string[] = [];
  const lookbackN = Math.max(todayN - LOOKBACK_DAYS, firstN);
  const today = localDate(tz, nowMs);
  for (let y = today.year, m = today.month; ; ) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    if (Math.floor(Date.UTC(y, m - 1, 1) / DAY_MS) < lookbackN) break;
    months.unshift(monthKey(y, m));
  }

  const categories: EngineProfile['categories'] = {};
  const categoryIds = new Set(months.flatMap((m) => [...(monthTotals.get(m)?.keys() ?? [])]));
  for (const id of categoryIds) {
    const monthlyTotals = months.map((m) => monthTotals.get(m)?.get(id) ?? 0);
    categories[id] = { monthlyTotals, median: median(monthlyTotals), mad: mad(monthlyTotals) };
  }

  return {
    version: PROFILE_VERSION,
    timezone: tz,
    windowDays,
    historyDays,
    mode: modeForHistory(historyDays),
    weekday: weekdayValues.map((values) => ({ values, median: median(values) })),
    overallDailyMedian: median(allDays),
    months,
    categories,
    payday: findPayday(input.incomeItems, input.cadences),
    widthFactor: input.widthFactor ?? 1,
    computedFrom: new Date(nowMs).toISOString(),
  };
}

/* ----------------------------------------------------------------------------------------------
 * Loaders
 * -------------------------------------------------------------------------------------------- */

/** Payee keys the labeller found to be the same payee: alias -> canonical (`engine_patterns.payee_merges`). */
export type PayeeMerges = Record<string, string>;

export function parsePayeeMerges(raw: string | null | undefined): PayeeMerges {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return {};
  }
}

export async function loadPayeeMerges(db: Db, userId: string): Promise<PayeeMerges> {
  const row = await first<{ payee_merges: string | null }>(db, 'SELECT payee_merges FROM engine_patterns WHERE user_id = ?', [userId]);
  return parsePayeeMerges(row?.payee_merges);
}

/** The rows with every merged alias payee replaced by its canonical payee, so cadences, watch and upcoming see one payee. */
export function applyPayeeMerges(rows: readonly EngineTxRow[], merges: PayeeMerges): EngineTxRow[] {
  if (Object.keys(merges).length === 0) return [...rows];
  return rows.map((r) => (Object.hasOwn(merges, r.payee_key) ? { ...r, payee_key: merges[r.payee_key] as string } : r));
}

/**
 * Transactions from the start of the local day `LOOKBACK_DAYS` ago up to `nowMs`, with the category scope and one-off
 * label, and the user's payee merges applied.
 */
export async function loadEngineRows(db: Db, userId: string, tz: string, nowMs: number): Promise<EngineTxRow[]> {
  return loadEngineRowsBetween(db, userId, startOfLocalDay(tz, addDays(localDate(tz, nowMs), -LOOKBACK_DAYS)), nowMs);
}

/** The same rows for any span `[fromMs, toMs]` (self-scoring and the backtest replay past months, which reach further back). */
export async function loadEngineRowsBetween(db: Db, userId: string, fromMs: number, toMs: number): Promise<EngineTxRow[]> {
  const [rows, merges] = await Promise.all([loadRawRows(db, userId, new Date(fromMs).toISOString(), toMs), loadPayeeMerges(db, userId)]);
  return applyPayeeMerges(rows, merges);
}

function loadRawRows(db: Db, userId: string, from: string, nowMs: number): Promise<EngineTxRow[]> {
  return all<EngineTxRow>(
    db,
    `SELECT t.id AS id, t.amount AS amount, t.type AS type, t.transaction_at AS transaction_at, t.category_id AS category_id,
       t.payee_key AS payee_key, t.counterparty_name AS counterparty_name, t.counterparty_type AS counterparty_type,
       t.recurring_item_id AS recurring_item_id, COALESCE(c.scope, 'spend') AS scope,
       EXISTS (SELECT 1 FROM txn_labels l WHERE l.transaction_id = t.id AND l.one_off = 1) AS one_off
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.deleted_at IS NULL AND t.transaction_at >= ? AND t.transaction_at <= ?`,
    [userId, from, new Date(nowMs).toISOString()],
  );
}

/** Explicit override on `engine_patterns`, else the user's latest recurring item's timezone, else Asia/Kolkata. */
export async function resolveTimezone(db: Db, userId: string): Promise<string> {
  const row = await first<{ tz: string | null }>(
    db,
    `SELECT COALESCE(
       (SELECT timezone FROM engine_patterns WHERE user_id = ?),
       (SELECT timezone FROM recurring_items WHERE user_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1)
     ) AS tz`,
    [userId, userId],
  );
  try {
    return row?.tz ? parseTimezone(row.tz) : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE; // a stored name this runtime does not know
  }
}

export async function loadFirstTransactionAt(db: Db, userId: string): Promise<string | null> {
  const row = await first<{ at: string | null }>(db, 'SELECT MIN(transaction_at) AS at FROM transactions WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  return row?.at ?? null;
}

export function loadIncomeItems(db: Db, userId: string): Promise<RecurringIncomeItem[]> {
  return all<RecurringIncomeItem>(db, "SELECT amount, day_of_month FROM recurring_items WHERE user_id = ? AND kind = 'income' AND active = 1", [userId]);
}
