import { addDays, localDate, parseTimezone, startOfLocalDay, tzOffsetMs } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';

/**
 * Calendar helpers for the agent. The prompts and `time_range` objects carry offset ISO strings
 * (`2026-06-01T00:00:00+05:30`, inclusive day ends at `23:59:59.999999`) exactly like Python's
 * `datetime.isoformat()`, because the LLM copies them into SQL.
 */

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export const DEFAULT_TIMEZONE = 'UTC';

/** Python `resolve_timezone` + `parse_tz`: blank/missing is UTC, an unknown name is a 400. */
export function resolveTimezone(timezone: string | null | undefined): string {
  const name = timezone?.trim() ? timezone.trim() : DEFAULT_TIMEZONE;
  return parseTimezone(name);
}

export function isoDate(d: LocalDate): string {
  return `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;
}

export function parseIsoDate(iso: string): LocalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Whole days from `a` to `b` (calendar arithmetic, no timezone). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Python `date.weekday()`: Monday = 0. */
export function weekdayMon0(d: LocalDate): number {
  return (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
}

export function weekdayName(d: LocalDate): string {
  return WEEKDAYS[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()] ?? '';
}

export function today(tz: string, nowMs: number): LocalDate {
  return localDate(tz, nowMs);
}

function formatOffset(offsetMs: number): string {
  const total = Math.round(offsetMs / 60_000);
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `datetime.combine(day, time(h, m, s, micro), tzinfo=tz).isoformat()`. */
export function wallIso(tz: string, date: LocalDate, h: number, m: number, s: number, micro = 0): string {
  const wallMs = ((h * 60 + m) * 60 + s) * 1000;
  const offset = tzOffsetMs(tz, startOfLocalDay(tz, date) + wallMs);
  const frac = micro > 0 ? `.${pad(micro, 6)}` : '';
  return `${isoDate(date)}T${pad(h)}:${pad(m)}:${pad(s)}${frac}${formatOffset(offset)}`;
}

/** Inclusive bounds of one calendar day. */
export function dayBoundsIso(tz: string, date: LocalDate): [string, string] {
  return [wallIso(tz, date, 0, 0, 0), wallIso(tz, date, 23, 59, 59, 999_999)];
}

/** Inclusive bounds of a calendar month (end is the last microsecond of the last day). */
export function monthBoundsIso(tz: string, year: number, month: number): [string, string] {
  const first: LocalDate = { year, month, day: 1 };
  const last: LocalDate = { year, month, day: daysInMonth(year, month) };
  return [wallIso(tz, first, 0, 0, 0), wallIso(tz, last, 23, 59, 59, 999_999)];
}

/** The calendar month before `ref` (a local date). */
export function previousMonthOf(ref: LocalDate): { year: number; month: number } {
  return ref.month === 1 ? { year: ref.year - 1, month: 12 } : { year: ref.year, month: ref.month - 1 };
}

export function previousMonthBoundsIso(tz: string, ref: LocalDate): [string, string] {
  const { year, month } = previousMonthOf(ref);
  return monthBoundsIso(tz, year, month);
}

/** Inclusive window of `n` calendar days ending on `endDay`. */
export function lastNDaysBoundsIso(tz: string, endDay: LocalDate, n: number): [string, string] {
  const start = addDays(endDay, -(n - 1));
  return [wallIso(tz, start, 0, 0, 0), wallIso(tz, endDay, 23, 59, 59, 999_999)];
}

/** Python `date.strftime('%d %b')`. */
export const dayMonthLabel = (d: LocalDate) => `${pad(d.day)} ${MONTH_ABBR[d.month - 1] ?? ''}`;
/** Python `date.strftime('%b %Y')`. */
export const monthYearLabel = (d: { year: number; month: number }) => `${MONTH_ABBR[d.month - 1] ?? ''} ${d.year}`;
