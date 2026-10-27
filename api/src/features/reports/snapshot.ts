import { formatCents } from '../../core/decimal';
import { dateKey, localDate } from '../../core/timezone';
import { daysInMonth, weekdayMon0 } from '../agent/dates';
import { IST } from '../email/periods';
import { share } from '../insights/rollup';
import { REPORT_VERSION } from './schemas';
import type { ReportCategory, ReportSlide, ReportSnapshot, ReportTitle, ReportWin } from './schemas';

/**
 * Pure snapshot builder: query results in, `ReportSnapshot` out. Facts and ids only; all copy lives in the app.
 * Money is integer cents inside and decimal strings (`formatCents`) in the output. Every threshold is compared on
 * exact integers (cents, counts), never on the rounded shares in the output.
 */

const TOP_CATEGORIES = 3;
/** Earlier months behind "usual" (median) and how far back they may reach. */
const USUAL_MONTHS = 3;
export const HISTORY_MONTHS = 6;
/** A change only counts when it is at least this much (Rs 500)... */
const NOTABLE_MIN_CENTS = 50_000;
/** ...and at least this fraction of the usual (1 / 4). */
const NOTABLE_FRACTION_DENOMINATOR = 4;
const TOP_PAYEE_MIN_VISITS = 3;
const RHYTHM_MIN_DEBITS = 15;
const STREAK_MIN_DAYS = 3;
const UNCATEGORIZED = 'Uncategorized';
const UNKNOWN_PAYEE_KEY = 'unknown';

export interface ReportDebit {
  amountCents: number;
  /** ISO UTC instant. */
  at: string;
  payeeKey: string;
  /** Display name as typed (counterparty_name); null/blank = unknown. */
  name: string | null;
  categoryId: string | null;
}

export interface CategoryInfo {
  name: string;
  icon_name: string | null;
  color: string | null;
}

/** One earlier month that has at least one debit. */
export interface EarlierMonth {
  periodKey: string;
  spentCents: number;
  /** Debit cents per category id (uncategorized is left out: it has no id to compare). */
  byCategory: ReadonlyMap<string, number>;
}

export interface SnapshotInput {
  year: number;
  month: number;
  nowIso: string;
  /** Every non-deleted debit of the month (IST bounds). */
  debits: readonly ReportDebit[];
  incomeCents: number;
  categories: ReadonlyMap<string, CategoryInfo>;
  /** Earlier complete months with data inside the last `HISTORY_MONTHS`, any order. */
  earlier: readonly EarlierMonth[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const periodKeyOf = (year: number, month: number): string => `${String(year).padStart(4, '0')}-${pad2(month)}`;

/** Middle value; the mean (rounded) of the two middle values for an even count; 0 for none. */
export function medianCents(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

const newestFirst = (months: readonly EarlierMonth[]): EarlierMonth[] => [...months].sort((a, b) => (a.periodKey < b.periodKey ? 1 : -1));

/** A change of `deltaCents` against `usualCents` is notable: at least Rs 500 and at least 25% of the usual. */
export function isNotable(deltaCents: number, usualCents: number): boolean {
  const abs = Math.abs(deltaCents);
  return abs >= NOTABLE_MIN_CENTS && abs * NOTABLE_FRACTION_DENOMINATOR >= usualCents;
}

/** Group the history query's rows (`ym` = IST `YYYY-MM`, `category_id` null = uncategorized) into per-month totals. */
export function historyFromRows(rows: readonly { ym: string; category_id: string | null; total: number }[]): EarlierMonth[] {
  const months = new Map<string, EarlierMonth & { byCategory: Map<string, number> }>();
  for (const row of rows) {
    const month = months.get(row.ym) ?? { periodKey: row.ym, spentCents: 0, byCategory: new Map<string, number>() };
    month.spentCents += row.total;
    if (row.category_id) month.byCategory.set(row.category_id, (month.byCategory.get(row.category_id) ?? 0) + row.total);
    months.set(row.ym, month);
  }
  return newestFirst([...months.values()].filter((m) => m.spentCents > 0));
}

interface Group {
  amount: number;
  count: number;
}

function addTo<K>(map: Map<K, Group>, key: K, cents: number): void {
  const entry = map.get(key) ?? { amount: 0, count: 0 };
  entry.amount += cents;
  entry.count += 1;
  map.set(key, entry);
}

function rankedCategories(
  groups: Map<string, Group>,
  info: ReadonlyMap<string, CategoryInfo>,
  spent: number,
): { listed: ReportCategory[]; top: { id: string; amount: number }[] } {
  const ranked = [...groups.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1));
  const toCategory = ([key, group]: [string, Group]): ReportCategory => {
    const meta = key === '' ? undefined : info.get(key);
    return {
      id: meta ? key : null,
      name: meta?.name ?? UNCATEGORIZED,
      icon_name: meta?.icon_name ?? null,
      color: meta?.color ?? null,
      amount: formatCents(group.amount),
      share: share(group.amount, spent),
      count: group.count,
    };
  };
  const listed = ranked.slice(0, TOP_CATEGORIES).map(toCategory);
  const rest = ranked.slice(TOP_CATEGORIES);
  if (rest.length > 0) {
    const amount = rest.reduce((sum, [, g]) => sum + g.amount, 0);
    listed.push({
      id: null,
      name: 'Other',
      icon_name: null,
      color: null,
      amount: formatCents(amount),
      share: share(amount, spent),
      count: rest.reduce((sum, [, g]) => sum + g.count, 0),
    });
  }
  const top = ranked
    .slice(0, TOP_CATEGORIES)
    .filter(([key]) => key !== '' && info.has(key))
    .map(([key, g]) => ({ id: key, amount: g.amount }));
  return { listed, top };
}

/** Longest run of consecutive days without a debit (first one wins a tie). */
function longestStreak(days: readonly { key: string; spent: boolean }[]): { days: number; start: string; end: string } {
  let best = { days: 0, start: '', end: '' };
  let runStart = -1;
  days.forEach((day, i) => {
    if (day.spent) {
      runStart = -1;
      return;
    }
    if (runStart < 0) runStart = i;
    const length = i - runStart + 1;
    if (length > best.days) best = { days: length, start: (days[runStart] as { key: string }).key, end: day.key };
  });
  return best;
}

/** Win order: a category that fell, a no-spend streak, the cheapest month so far; else none. */
export function pickWin(input: {
  spentCents: number;
  topCategories: readonly { id: string; amount: number }[];
  categories: ReadonlyMap<string, CategoryInfo>;
  earlier: readonly EarlierMonth[];
  streak: { days: number; start: string; end: string };
}): ReportWin {
  const usualMonths = newestFirst(input.earlier).slice(0, USUAL_MONTHS);
  if (usualMonths.length > 0) {
    let best: { id: string; amount: number; usual: number; drop: number } | null = null;
    for (const cat of input.topCategories) {
      const usual = medianCents(usualMonths.map((m) => m.byCategory.get(cat.id) ?? 0));
      const drop = usual - cat.amount;
      if (usual > 0 && isNotable(drop, usual) && drop > 0 && (!best || drop > best.drop)) best = { id: cat.id, amount: cat.amount, usual, drop };
    }
    if (best) {
      const meta = input.categories.get(best.id);
      return {
        kind: 'category_down',
        category_id: best.id,
        category_name: meta?.name ?? UNCATEGORIZED,
        icon_name: meta?.icon_name ?? null,
        color: meta?.color ?? null,
        amount: formatCents(best.amount),
        usual: formatCents(best.usual),
        delta: formatCents(best.drop),
      };
    }
  }
  if (input.streak.days >= STREAK_MIN_DAYS) {
    return { kind: 'no_spend_streak', days: input.streak.days, start: input.streak.start, end: input.streak.end };
  }
  if (input.earlier.length >= 2) {
    const lowest = Math.min(...input.earlier.map((m) => m.spentCents));
    if (input.spentCents < lowest) {
      return { kind: 'lowest_month', spent: formatCents(input.spentCents), previous_lowest: formatCents(lowest), months_compared: input.earlier.length };
    }
  }
  return { kind: 'none' };
}

/** First match wins. Ratios are compared as integers (`a * 100 >= b * 35`). */
export function pickTitle(input: {
  spentCents: number;
  debitCount: number;
  medianDebitCents: number;
  weekendCents: number;
  firstWeekCents: number;
  noSpendDays: number;
  biggest: { amountCents: number; name: string } | null;
  topPayee: { payee_key: string; display_name: string; count: number } | null;
}): ReportTitle {
  const { spentCents: spent, biggest, topPayee } = input;
  if (spent <= 0) return { id: 'steady', evidence: {} };
  if (biggest && biggest.amountCents * 100 >= spent * 35) {
    return { id: 'one_big_splurge', evidence: { share: share(biggest.amountCents, spent), amount: formatCents(biggest.amountCents), display_name: biggest.name } };
  }
  if (topPayee && (topPayee.count >= 8 || topPayee.count * 4 >= input.debitCount)) {
    return { id: 'loyalist', evidence: { payee_key: topPayee.payee_key, display_name: topPayee.display_name, count: topPayee.count } };
  }
  if (input.weekendCents * 2 >= spent) {
    return { id: 'weekend_warrior', evidence: { weekend_share: share(input.weekendCents, spent) } };
  }
  if (input.firstWeekCents * 100 >= spent * 45) {
    return { id: 'payday_sprinter', evidence: { first_week_share: share(input.firstWeekCents, spent) } };
  }
  if (input.debitCount >= 40 && input.medianDebitCents * 20 <= spent) {
    return { id: 'thousand_cuts', evidence: { debit_count: input.debitCount, median_debit: formatCents(input.medianDebitCents) } };
  }
  if (input.noSpendDays >= 10) {
    return { id: 'ghost', evidence: { no_spend_days: input.noSpendDays } };
  }
  return { id: 'steady', evidence: {} };
}

/** Cover, damage, lineup and closing always; the other four only when there is something to say. */
export function slidesFor(input: { hasTopPayee: boolean; hasBiggest: boolean; debitCount: number; win: ReportWin }): ReportSlide[] {
  const slides: ReportSlide[] = ['cover', 'damage', 'lineup'];
  if (input.hasTopPayee) slides.push('regular');
  if (input.hasBiggest) slides.push('moment');
  if (input.debitCount >= RHYTHM_MIN_DEBITS) slides.push('rhythm');
  if (input.win.kind !== 'none') slides.push('win');
  slides.push('closing');
  return slides;
}

export function buildSnapshot(input: SnapshotInput): ReportSnapshot {
  const { year, month, debits } = input;
  const spent = debits.reduce((sum, d) => sum + d.amountCents, 0);
  const earlier = newestFirst(input.earlier);

  // One pass over the month: category / payee / local-day buckets.
  const byCategory = new Map<string, Group>();
  const byPayee = new Map<string, Group & { names: { at: string; name: string }[] }>();
  const byDay = new Map<string, Group>();
  const weekday = new Array<number>(7).fill(0);
  let firstWeekCents = 0;
  let biggest: { debit: ReportDebit; date: string } | null = null;
  for (const debit of debits) {
    const local = localDate(IST, Date.parse(debit.at));
    const date = dateKey(local);
    addTo(byCategory, debit.categoryId ?? '', debit.amountCents);
    addTo(byDay, date, debit.amountCents);
    weekday[weekdayMon0(local)] = (weekday[weekdayMon0(local)] ?? 0) + debit.amountCents;
    if (local.day <= 7) firstWeekCents += debit.amountCents;

    const payee = byPayee.get(debit.payeeKey) ?? { amount: 0, count: 0, names: [] };
    payee.amount += debit.amountCents;
    payee.count += 1;
    if (debit.name?.trim()) payee.names.push({ at: debit.at, name: debit.name.trim() });
    byPayee.set(debit.payeeKey, payee);

    if (!biggest || debit.amountCents > biggest.debit.amountCents || (debit.amountCents === biggest.debit.amountCents && debit.at < biggest.debit.at)) {
      biggest = { debit, date };
    }
  }

  const { listed: categories, top: topCategories } = rankedCategories(byCategory, input.categories, spent);

  const payeeCandidates = [...byPayee.entries()]
    .filter(([key, p]) => key !== UNKNOWN_PAYEE_KEY && p.count >= TOP_PAYEE_MIN_VISITS)
    .sort((a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount || (a[0] < b[0] ? -1 : 1));
  const topPayeeEntry = payeeCandidates[0];
  const topPayee = topPayeeEntry
    ? {
        payee_key: topPayeeEntry[0],
        // The oldest non-empty name of the group, like the insights payee roll-up.
        display_name: [...topPayeeEntry[1].names].sort((a, b) => (a.at < b.at ? -1 : 1))[0]?.name ?? 'Unknown',
        count: topPayeeEntry[1].count,
        amount: formatCents(topPayeeEntry[1].amount),
      }
    : null;

  const biggestSpend = biggest
    ? {
        amount: formatCents(biggest.debit.amountCents),
        display_name: biggest.debit.name?.trim() || 'Unknown',
        category_name: (biggest.debit.categoryId ? input.categories.get(biggest.debit.categoryId)?.name : undefined) ?? UNCATEGORIZED,
        date: biggest.date,
      }
    : null;

  const busiestEntry = [...byDay.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))[0];
  const busiestDay = busiestEntry ? { date: busiestEntry[0], amount: formatCents(busiestEntry[1].amount), count: busiestEntry[1].count } : null;

  const dayList = Array.from({ length: daysInMonth(year, month) }, (_, i) => {
    const key = dateKey({ year, month, day: i + 1 });
    return { key, spent: byDay.has(key) };
  });
  const noSpendDays = dayList.filter((d) => !d.spent).length;
  const streak = longestStreak(dayList);

  const weekendCents = (weekday[5] ?? 0) + (weekday[6] ?? 0);
  const peakIndex = weekday.reduce((best, value, i) => (value > (weekday[best] ?? 0) ? i : best), 0);

  // "Usual": median of the (up to 3) most recent earlier months with data.
  const usualMonths = earlier.slice(0, USUAL_MONTHS);
  const usualCents = usualMonths.length > 0 ? medianCents(usualMonths.map((m) => m.spentCents)) : null;
  const delta = usualCents === null ? null : spent - usualCents;

  const win = pickWin({ spentCents: spent, topCategories, categories: input.categories, earlier, streak });
  const title = pickTitle({
    spentCents: spent,
    debitCount: debits.length,
    medianDebitCents: medianCents(debits.map((d) => d.amountCents)),
    weekendCents,
    firstWeekCents,
    noSpendDays,
    biggest: biggest ? { amountCents: biggest.debit.amountCents, name: biggestSpend?.display_name ?? 'Unknown' } : null,
    topPayee,
  });

  return {
    version: REPORT_VERSION,
    period_key: periodKeyOf(year, month),
    year,
    month,
    timezone: IST,
    generated_at: input.nowIso,
    slides: slidesFor({ hasTopPayee: topPayee !== null, hasBiggest: biggestSpend !== null, debitCount: debits.length, win }),
    debit_count: debits.length,
    spent: formatCents(spent),
    income: formatCents(input.incomeCents),
    usual_spent: usualCents === null ? null : formatCents(usualCents),
    vs_usual: usualCents === null || delta === null ? null : isNotable(delta, usualCents) ? (delta > 0 ? 'up' : 'down') : 'same',
    vs_usual_delta: delta === null ? null : formatCents(Math.abs(delta)),
    categories,
    top_payee: topPayee,
    biggest_spend: biggestSpend,
    busiest_day: busiestDay,
    weekday: {
      totals: weekday.map(formatCents),
      peak_index: peakIndex,
      weekend_share: spent > 0 ? share(weekendCents, spent) : 0,
    },
    no_spend_days: noSpendDays,
    longest_no_spend_streak: streak.days,
    first_week_share: spent > 0 ? share(firstWeekCents, spent) : 0,
    win,
    title,
  };
}
