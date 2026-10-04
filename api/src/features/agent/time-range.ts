import { addDays } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import {
  MONTH_ABBR,
  daysBetween,
  dayBoundsIso,
  dayMonthLabel,
  isoDate,
  lastNDaysBoundsIso,
  monthBoundsIso,
  monthYearLabel,
  parseIsoDate,
  previousMonthBoundsIso,
  resolveTimezone,
  today,
} from './dates';

/**
 * Deterministic resolution of relative date phrases to authoritative, inclusive calendar ranges
 * (port of `features/agent/time_range.py`). Single-period phrases are handled here; "A vs B"
 * comparisons come from the classifier step through `buildCompareTimeRange`.
 */

export type SingleRangeKind = 'last_n_days' | 'current_month' | 'previous_month' | 'calendar_year' | 'today' | 'yesterday';

export interface PackedRange {
  kind: SingleRangeKind;
  n: number | null;
  start_date: string;
  end_date: string;
  day_count: number;
  start_iso: string;
  end_iso: string;
  label: string;
  daily_comparison?: boolean;
}

export interface ComparePeriod {
  start_iso: string;
  end_iso: string;
  label: string;
}

export interface CompareRange {
  kind: 'compare';
  subkind: 'month_pair' | 'year_pair';
  period_a: ComparePeriod;
  period_b: ComparePeriod;
  label: string;
}

export type TimeRange = PackedRange | CompareRange;

export const MAX_DAILY_COMPARISON_DAYS = 40;

const LAST_N_DAYS_RE = /\b(?:last|past)\s+(\d+)\s+days?\b/i;
const LAST_WEEK_RE = /\b(?:last|past)\s+week\b/i;
const THIS_MONTH_RE = /\b(?:this|current)\s+month\b/i;
const MONTHLY_BUDGET_RE =
  /\b(?:monthly\s+budget|over\s+(?:my\s+)?(?:monthly\s+)?budget|within\s+(?:my\s+)?(?:monthly\s+)?budget|under\s+(?:my\s+)?budget|budget\s+status)\b/i;
const PREVIOUS_MONTH_RE = /\b(?:previous|prior)\s+month\b|\blast\s+month\b/i;
const THIS_YEAR_RE = /\b(?:this|current)\s+year\b/i;
const TODAY_RE = /\btoday\b/i;
const YESTERDAY_RE = /\byesterday\b/i;
const DAILY_COMPARISON_RE =
  /\b(?:daily|day[\s-]by[\s-]day|per\s+day|each\s+day|every\s+day|day[\s-]to[\s-]day|by\s+day|busiest\s+day|peak\s+day)\b/i;

export const isDailyComparisonText = (text: string): boolean => DAILY_COMPARISON_RE.test(text);

export const isCompareRange = (range: TimeRange | null | undefined): range is CompareRange => range?.kind === 'compare';

function formatLabel(start: LocalDate, end: LocalDate, dayCount: number): string {
  const endMonthYear = monthYearLabel(end);
  if (start.year === end.year) {
    if (start.month === end.month) return `${start.day}–${end.day} ${endMonthYear} (${dayCount} days)`;
    return `${dayMonthLabel(start)} – ${dayMonthLabel(end)} ${end.year} (${dayCount} days)`;
  }
  return `${dayMonthLabel(start)} ${start.year} – ${dayMonthLabel(end)} ${end.year} (${dayCount} days)`;
}

function packRange(kind: SingleRangeKind, startIso: string, endIso: string, n: number | null = null): PackedRange {
  const startDay = parseIsoDate(startIso);
  const endDay = parseIsoDate(endIso);
  const dayCount = daysBetween(startDay, endDay) + 1;
  return {
    kind,
    n,
    start_date: isoDate(startDay),
    end_date: isoDate(endDay),
    day_count: dayCount,
    start_iso: startIso,
    end_iso: endIso,
    label: formatLabel(startDay, endDay, dayCount),
  };
}

/** Map common relative phrases to an inclusive local-date window; null when none matches. */
export function resolveTimeRange(text: string, timezone: string | null | undefined, nowMs: number = Date.now()): PackedRange | null {
  if (!text.trim()) return null;
  const tz = resolveTimezone(timezone);
  const day = today(tz, nowMs);

  const last = LAST_N_DAYS_RE.exec(text);
  if (last) {
    const n = Number(last[1]);
    if (n < 1) return null;
    const [start, end] = lastNDaysBoundsIso(tz, day, n);
    return packRange('last_n_days', start, end, n);
  }
  if (LAST_WEEK_RE.test(text)) {
    const [start, end] = lastNDaysBoundsIso(tz, day, 7);
    return packRange('last_n_days', start, end, 7);
  }
  if (YESTERDAY_RE.test(text)) {
    const [start, end] = dayBoundsIso(tz, addDays(day, -1));
    return packRange('yesterday', start, end);
  }
  if (TODAY_RE.test(text)) {
    const [start, end] = dayBoundsIso(tz, day);
    return packRange('today', start, end);
  }
  if (THIS_MONTH_RE.test(text) || MONTHLY_BUDGET_RE.test(text)) {
    const [start, end] = monthBoundsIso(tz, day.year, day.month);
    return packRange('current_month', start, end);
  }
  if (PREVIOUS_MONTH_RE.test(text)) {
    const [start, end] = previousMonthBoundsIso(tz, day);
    return packRange('previous_month', start, end);
  }
  if (THIS_YEAR_RE.test(text)) {
    const [start] = dayBoundsIso(tz, { year: day.year, month: 1, day: 1 });
    const [, end] = dayBoundsIso(tz, day);
    return packRange('calendar_year', start, end);
  }
  return null;
}

export function spansMultipleCalendarMonths(range: TimeRange | null | undefined): boolean {
  if (!range) return false;
  if (range.kind === 'calendar_year') return true;
  const startRaw = (range as Partial<PackedRange>).start_date;
  const endRaw = (range as Partial<PackedRange>).end_date;
  if (typeof startRaw !== 'string' || typeof endRaw !== 'string') return false;
  const start = parseIsoDate(startRaw);
  const end = parseIsoDate(endRaw);
  return start.year !== end.year || start.month !== end.month;
}

export function buildDailyRangeClarification(range: Pick<PackedRange, 'label' | 'day_count'>): string {
  const label = range.label || 'that range';
  const dayCount = range.day_count || 0;
  return (
    `I can chart daily spending for up to **${MAX_DAILY_COMPARISON_DAYS} days** at a time. ` +
    `You asked for **${label}** (${dayCount} days), which is a bit long for a day-by-day view.\n\n` +
    `Try a shorter window — for example, "daily spending for the last 40 days" ` +
    `or "show my daily spending this week". If you want the full **${dayCount}-day** total ` +
    `without a daily chart, just ask for total spending over that period.`
  );
}

/** Tag the range for per-day requests and enforce the `MAX_DAILY_COMPARISON_DAYS` cap. */
export function resolveDailyComparisonRange(input: {
  userText: string;
  goal: string;
  timeRange: PackedRange | null;
  timezone: string | null | undefined;
  nowMs?: number;
}): { timeRange: PackedRange | null; clarification: string | null } {
  const { userText, goal, timeRange, timezone, nowMs = Date.now() } = input;
  if (!isDailyComparisonText(userText) && !isDailyComparisonText(goal)) return { timeRange, clarification: null };

  const tz = resolveTimezone(timezone);
  if (timeRange === null) {
    const [start, end] = lastNDaysBoundsIso(tz, today(tz, nowMs), MAX_DAILY_COMPARISON_DAYS);
    const defaulted = packRange('last_n_days', start, end, MAX_DAILY_COMPARISON_DAYS);
    defaulted.daily_comparison = true;
    return { timeRange: defaulted, clarification: null };
  }
  if (timeRange.day_count > MAX_DAILY_COMPARISON_DAYS) {
    return { timeRange, clarification: buildDailyRangeClarification(timeRange) };
  }
  return { timeRange: { ...timeRange, daily_comparison: true }, clarification: null };
}

export interface CashflowPointLike {
  date?: unknown;
  amount?: unknown;
}

/** One point per calendar day in `[startDate, endDate]`, zero where the model sent nothing. */
export function fillCashflowPoints(
  points: readonly CashflowPointLike[],
  startDate: string,
  endDate: string,
): { date: string; amount: number }[] {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const total = daysBetween(start, end);
  if (total < 0) return points.map((p) => ({ date: String(p.date), amount: Number(p.amount) }));

  const byDate = new Map<string, number>();
  for (const point of points) {
    const rawDate = typeof point.date === 'string' ? point.date.slice(0, 10) : '';
    if (!rawDate || typeof point.amount !== 'number') continue;
    byDate.set(rawDate, point.amount);
  }
  const filled: { date: string; amount: number }[] = [];
  for (let i = 0; i <= total; i++) {
    const key = isoDate(addDays(start, i));
    filled.push({ date: key, amount: byDate.get(key) ?? 0 });
  }
  return filled;
}

function requireInt(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${what} must be an integer`);
  return value;
}

/**
 * Convert classifier output to an authoritative compare range (pure date arithmetic). Throws on
 * unusable periods (missing or out-of-range month, absurd year): the caller falls back to the
 * standard SQL route, as Python's classify node did on any exception.
 */
export function buildCompareTimeRange(
  kind: 'month_pair' | 'year_pair',
  periodA: { year: number; month?: number | null; ytd?: boolean | null },
  periodB: { year: number; month?: number | null; ytd?: boolean | null },
  opts: { tz: string; today: LocalDate },
): CompareRange {
  const { tz } = opts;
  const checkYear = (y: unknown) => {
    const year = requireInt(y, 'year');
    if (year < 1 || year > 9999) throw new Error('year out of range');
    return year;
  };

  if (kind === 'month_pair') {
    const yearA = checkYear(periodA.year);
    const yearB = checkYear(periodB.year);
    const monthA = requireInt(periodA.month, 'month');
    const monthB = requireInt(periodB.month, 'month');
    if (monthA < 1 || monthA > 12 || monthB < 1 || monthB > 12) throw new Error('month out of range');
    const [aStart, aEnd] = monthBoundsIso(tz, yearA, monthA);
    const [bStart, bEnd] = monthBoundsIso(tz, yearB, monthB);
    const labelA = `${MONTH_ABBR[monthA - 1] ?? ''} ${yearA}`;
    const labelB = `${MONTH_ABBR[monthB - 1] ?? ''} ${yearB}`;
    return {
      kind: 'compare',
      subkind: 'month_pair',
      period_a: { start_iso: aStart, end_iso: aEnd, label: labelA },
      period_b: { start_iso: bStart, end_iso: bEnd, label: labelB },
      label: `${labelA} vs ${labelB}`,
    };
  }

  const yearRange = (year: number, ytd: boolean): ComparePeriod => {
    const [start] = dayBoundsIso(tz, { year, month: 1, day: 1 });
    const [, end] = dayBoundsIso(tz, ytd ? opts.today : { year, month: 12, day: 31 });
    return { start_iso: start, end_iso: end, label: ytd ? `${year} (YTD)` : String(year) };
  };
  const a = yearRange(checkYear(periodA.year), Boolean(periodA.ytd));
  const b = yearRange(checkYear(periodB.year), Boolean(periodB.ytd));
  return { kind: 'compare', subkind: 'year_pair', period_a: a, period_b: b, label: `${a.label} vs ${b.label}` };
}
