import { dateKey, localDate, startOfLocalDay } from '../../core/timezone';
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

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

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
