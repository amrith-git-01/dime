import { dateKey, daysInMonth, localDate, startOfLocalDay } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';

/**
 * Calendar math of recurring items. Everything is a LOCAL calendar date in the item's timezone; the posting
 * instant of a due date is 06:00 local. Only the requested `day_of_month` is stored: a month that is shorter
 * clamps it (31 -> Feb 28/29) at compute time, so a 31st item is back on the 31st in the next long month.
 */
export type Cadence = 'monthly' | 'yearly';

export interface Schedule {
  cadence: Cadence;
  day_of_month: number;
  month_of_year: number | null;
}

/** Local hour a due date is posted at. */
export const POST_HOUR = 6;

const clamped = (year: number, month: number, day: number): LocalDate => ({ year, month, day: Math.min(day, daysInMonth(year, month)) });

export function parseDateKey(key: string): LocalDate {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** The due date of the period that contains `year`/`month` (monthly: that month; yearly: that year). */
export function dueInPeriod(s: Schedule, year: number, month: number): LocalDate {
  return s.cadence === 'monthly' ? clamped(year, month, s.day_of_month) : clamped(year, s.month_of_year ?? 1, s.day_of_month);
}

/** The due date one period after the period of `due`. */
export function nextAfter(s: Schedule, due: LocalDate): LocalDate {
  if (s.cadence === 'yearly') return clamped(due.year + 1, s.month_of_year ?? 1, s.day_of_month);
  return due.month === 12 ? clamped(due.year + 1, 1, s.day_of_month) : clamped(due.year, due.month + 1, s.day_of_month);
}

/** UTC instant (ms) at which a due date is posted: 06:00 local. */
export function dueInstantMs(tz: string, due: LocalDate): number {
  return startOfLocalDay(tz, due) + POST_HOUR * 3_600_000;
}

/** Local `[start, end)` of the period that contains `due`, as UTC ISO strings (to look for an already posted transaction). */
export function periodRange(s: Schedule, tz: string, due: LocalDate): { from: string; to: string } {
  const [a, b] =
    s.cadence === 'yearly'
      ? [{ year: due.year, month: 1, day: 1 }, { year: due.year + 1, month: 1, day: 1 }]
      : [{ year: due.year, month: due.month, day: 1 }, due.month === 12 ? { year: due.year + 1, month: 1, day: 1 } : { year: due.year, month: due.month + 1, day: 1 }];
  return { from: new Date(startOfLocalDay(tz, a)).toISOString(), to: new Date(startOfLocalDay(tz, b)).toISOString() };
}

/** The period a due-date key (`YYYY-MM-DD`) belongs to: its month for a monthly item, its year for a yearly one. One live row or skip per period is enough. */
export const periodOf = (cadence: Cadence, key: string): string => (cadence === 'yearly' ? key.slice(0, 4) : key.slice(0, 7));

/** Periods a plan looks ahead from an item's start: far more than a real item can be behind, and a bound on a bad row. */
const MAX_PLAN_PERIODS = 600;

export interface OccurrencePlan {
  /** Occurrences to post now, oldest first: their posting instant has passed and no live row or skip covers their period. */
  due: LocalDate[];
  /** The first occurrence left after `due` (the cached `next_due_date`): the first uncovered one, past or future. */
  next: LocalDate;
}

/**
 * What an item owes, from facts only (docs/MONEY-MODEL-FIX-PLAN.md R6). Walks the item's periods from `startsOn` and skips every
 * period that already holds a live posting or a skip (`taken`: the occurrence dates, whatever day of the period they are on, so a
 * changed day never posts a period twice). The uncovered ones whose 06:00 local has passed (`nowMs`) are `due`, at most `limit`
 * of them; the first uncovered one after those is `next`. Nothing is read from a moving pointer.
 */
export function planOccurrences(s: Schedule, tz: string, startsOn: string, taken: Iterable<string>, nowMs: number, limit: number): OccurrencePlan {
  const covered = new Set<string>();
  for (const key of taken) covered.add(periodOf(s.cadence, key));
  const start = parseDateKey(startsOn);
  const due: LocalDate[] = [];
  let d = dueInPeriod(s, start.year, start.month);
  for (let i = 0; i < MAX_PLAN_PERIODS; i += 1) {
    if (!covered.has(periodOf(s.cadence, dateKey(d)))) {
      if (due.length >= limit || dueInstantMs(tz, d) > nowMs) break;
      due.push(d);
    }
    d = nextAfter(s, d);
  }
  return { due, next: d };
}

/**
 * First due date from `today` on: this period's when it is today or later (and nothing was posted for the period yet),
 * otherwise the next period's. Never a past date, so nothing older is ever backfilled.
 */
export function firstDueFrom(s: Schedule, tz: string, nowMs: number, postedThisPeriod = false): LocalDate {
  const today = localDate(tz, nowMs);
  const current = dueInPeriod(s, today.year, today.month);
  return dateKey(current) >= dateKey(today) && !postedThisPeriod ? current : nextAfter(s, current);
}

/** True when this period's due date is before today (local), i.e. it was missed and may be posted right away on request. */
export function currentPeriodPassed(s: Schedule, tz: string, nowMs: number): boolean {
  const today = localDate(tz, nowMs);
  return dateKey(dueInPeriod(s, today.year, today.month)) < dateKey(today);
}
