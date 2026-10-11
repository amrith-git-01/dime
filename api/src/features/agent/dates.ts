import { addDays, dateKey, localDate, parseTimezone, startOfLocalDay, tzOffsetMs } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';

/**
 * Calendar helpers for the agent: local dates (`YYYY-MM-DD`, the timezone of the app), the NOW block of
 * the prompt and the wall-clock instants of deep links.
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

const DEFAULT_TIMEZONE = 'UTC';

/** Blank or missing is UTC; an unknown name is a 400 (`Invalid timezone: 'x'`). */
export function resolveTimezone(timezone: string | null | undefined): string {
  return parseTimezone(timezone?.trim() ? timezone.trim() : DEFAULT_TIMEZONE);
}

export const isoDate = dateKey;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date `YYYY-MM-DD`, or null. */
export function parseIsoDate(iso: string): LocalDate | null {
  const m = DATE_RE.exec(iso);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return check.getUTCFullYear() === date.year && check.getUTCMonth() === date.month - 1 && check.getUTCDate() === date.day ? date : null;
}

/** Whole days from `a` to `b` (calendar arithmetic, no timezone). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekdayName(d: LocalDate): string {
  return WEEKDAYS[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()] ?? '';
}

/** 0 = Monday .. 6 = Sunday. */
export function weekdayMon0(d: LocalDate): number {
  return (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
}

export const today = (tz: string, nowMs: number): LocalDate => localDate(tz, nowMs);

function formatOffset(offsetMs: number): string {
  const total = Math.round(offsetMs / 60_000);
  const abs = Math.abs(total);
  return `${total < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Offset ISO string of a wall-clock time on a local date (`2026-06-01T00:00:00+05:30`). */
export function wallIso(tz: string, date: LocalDate, h: number, m: number, s: number, micro = 0): string {
  const wallMs = ((h * 60 + m) * 60 + s) * 1000;
  const offset = tzOffsetMs(tz, startOfLocalDay(tz, date) + wallMs);
  const frac = micro > 0 ? `.${pad(micro, 6)}` : '';
  return `${isoDate(date)}T${pad(h)}:${pad(m)}:${pad(s)}${frac}${formatOffset(offset)}`;
}

/** The authoritative NOW block of the prompt, so the model never guesses dates. */
export function nowBlock(tz: string, nowMs: number): string {
  const day = today(tz, nowMs);
  const monthStart = { ...day, day: 1 };
  const monthEnd = { ...day, day: daysInMonth(day.year, day.month) };
  const prevEndOfMonth = addDays(monthStart, -1);
  const prevStart = { ...prevEndOfMonth, day: 1 };
  return [
    '## NOW (authoritative; never guess dates)',
    `Today: ${isoDate(day)} (${weekdayName(day)}). Timezone: ${tz}. Currency: INR.`,
    `This month: ${isoDate(monthStart)} to ${isoDate(monthEnd)}. Last month: ${isoDate(prevStart)} to ${isoDate(prevEndOfMonth)}.`,
    `Last 7 days: ${isoDate(addDays(day, -6))} to ${isoDate(day)}. Last 30 days: ${isoDate(addDays(day, -29))} to ${isoDate(day)}.`,
  ].join('\n');
}
