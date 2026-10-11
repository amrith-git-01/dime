import { addDays, localDate, monthRange, startOfLocalDay } from '../../core/timezone';
import type { IsoRange, LocalDate } from '../../core/timezone';
import { MONTH_ABBR, MONTH_FULL, daysBetween, weekdayMon0 } from '../agent/dates';
import type { DigestKind } from './tokens';

/**
 * Digest periods, always in IST (Python `periods.py` / `ticker.py`). A message carries only
 * `(kind, period_key)`; the bounds and labels are derived from the key, so a retried message still
 * describes the same week or month.
 */

export const IST = 'Asia/Kolkata';

export interface DigestPeriod {
  kind: DigestKind;
  /** `2026-W33` (ISO week of the previous Mon-Sun) or `2026-08` (previous calendar month). */
  periodKey: string;
  /** Half-open `[from, to)` as UTC instants. */
  range: IsoRange;
  kicker: 'THIS WEEK' | 'THIS MONTH';
  rangeLabel: string;
  subject: string;
  /** Month whose budget the digest reports on (the month containing the period's last day). */
  budgetYear: number;
  budgetMonth: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const iso = (ms: number) => new Date(ms).toISOString();

/** ISO-8601 `(year, week)` of a date. */
export function isoWeekOf(d: LocalDate): { isoYear: number; isoWeek: number } {
  // The Thursday of the same ISO week decides the year.
  const thursday = addDays(d, 3 - weekdayMon0(d));
  const isoYear = thursday.year;
  const dayOfYear = daysBetween({ year: isoYear, month: 1, day: 1 }, thursday);
  return { isoYear, isoWeek: Math.floor(dayOfYear / 7) + 1 };
}

/** Monday of ISO week `(isoYear, isoWeek)`. */
export function mondayOfIsoWeek(isoYear: number, isoWeek: number): LocalDate {
  const jan4: LocalDate = { year: isoYear, month: 1, day: 4 };
  const week1Monday = addDays(jan4, -weekdayMon0(jan4));
  return addDays(week1Monday, (isoWeek - 1) * 7);
}

function weekPeriod(monday: LocalDate, periodKey: string): DigestPeriod {
  const sunday = addDays(monday, 6);
  const nextMonday = addDays(monday, 7);
  const dm = (d: LocalDate) => `${pad(d.day)} ${MONTH_ABBR[d.month - 1] ?? ''}`;
  return {
    kind: 'weekly',
    periodKey,
    range: { from: iso(startOfLocalDay(IST, monday)), to: iso(startOfLocalDay(IST, nextMonday)) },
    kicker: 'THIS WEEK',
    rangeLabel: `${dm(monday)} – ${dm(sunday)} ${sunday.year}`,
    subject: 'Your week in Dime',
    budgetYear: sunday.year,
    budgetMonth: sunday.month,
  };
}

function monthPeriod(year: number, month: number): DigestPeriod {
  return {
    kind: 'monthly',
    periodKey: `${String(year).padStart(4, '0')}-${pad(month)}`,
    range: monthRange(IST, year, month),
    kicker: 'THIS MONTH',
    rangeLabel: `${MONTH_FULL[month - 1] ?? ''} ${year}`,
    subject: `Your ${MONTH_FULL[month - 1] ?? ''} in Dime`,
    budgetYear: year,
    budgetMonth: month,
  };
}

/** The previous complete Mon-Sun week, relative to `nowMs` (IST). */
export function previousWeekPeriod(nowMs: number): DigestPeriod {
  const today = localDate(IST, nowMs);
  const thisMonday = addDays(today, -weekdayMon0(today));
  const prevMonday = addDays(thisMonday, -7);
  const { isoYear, isoWeek } = isoWeekOf(prevMonday);
  return weekPeriod(prevMonday, `${isoYear}-W${pad(isoWeek)}`);
}

/** The previous complete calendar month, relative to `nowMs` (IST). */
export function previousMonthPeriod(nowMs: number): DigestPeriod {
  const today = localDate(IST, nowMs);
  return today.month === 1 ? monthPeriod(today.year - 1, 12) : monthPeriod(today.year, today.month - 1);
}

export function digestPeriodNow(kind: DigestKind, nowMs: number): DigestPeriod {
  return kind === 'weekly' ? previousWeekPeriod(nowMs) : previousMonthPeriod(nowMs);
}

/** Rebuild a period from the key carried by a queue message; null when the key is malformed. */
export function digestPeriodFromKey(kind: DigestKind, periodKey: string): DigestPeriod | null {
  if (kind === 'weekly') {
    const m = /^(\d{4})-W(\d{2})$/.exec(periodKey);
    if (!m) return null;
    const week = Number(m[2]);
    if (week < 1 || week > 53) return null;
    return weekPeriod(mondayOfIsoWeek(Number(m[1]), week), periodKey);
  }
  const m = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return monthPeriod(Number(m[1]), month);
}

/**
 * Digests due on the IST calendar day of `nowMs` (the 08:00 IST cron): weekly on Monday, monthly on
 * the 1st (both when the 1st is a Monday).
 */
export function dueDigestKinds(nowMs: number): DigestKind[] {
  const today = localDate(IST, nowMs);
  const due: DigestKind[] = [];
  if (weekdayMon0(today) === 0) due.push('weekly');
  if (today.day === 1) due.push('monthly');
  return due;
}

