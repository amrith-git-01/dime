import { addDays, dateKey, startOfLocalDay, tzOffsetMs } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { parseDateKey } from '../recurring/schedule';

/**
 * Calendar math of reminders. PURE: no I/O, no clock (callers pass `nowMs`). Everything is a LOCAL calendar date and
 * wall-clock time in the reminder's timezone; an instant is a UTC epoch in ms.
 *
 * A reminder with due date D, time T, lead days L and overdue nudges N fires at `D - l days at T` for each l in L and at
 * `D + k days at T` for k = 1..N. An instant that falls inside the quiet hours moves to the quiet end. A repeating
 * reminder also has a final "roll" instant after its last step, when the cron moves it on to the next occurrence.
 */
export type ReminderCadence = 'none' | 'weekly' | 'monthly' | 'yearly';

export const DEFAULT_REMIND_TIME = '09:00';
export const MAX_LEAD_DAYS = 30;
export const MAX_LEAD_ENTRIES = 5;
export const MAX_OVERDUE_NUDGES = 5;
/** Largest lead of the user's default list (and of monthly / yearly reminders): it must stay inside one occurrence. */
export const MAX_DEFAULT_LEAD_DAYS = 27;

/** Largest lead day a reminder of this cadence can use: a weekly one cannot be reminded 7 days ahead of the previous occurrence. */
export function leadCap(cadence: ReminderCadence): number {
  return cadence === 'none' ? MAX_LEAD_DAYS : cadence === 'weekly' ? 6 : MAX_DEFAULT_LEAD_DAYS;
}

const MINUTE_MS = 60_000;

/** Quiet hours as `HH:MM` strings; a window that crosses midnight has `start > end`. `start === end` is no window. */
export interface QuietHours {
  start: string;
  end: string;
}

export interface ScheduleInput {
  /** Local due date, `YYYY-MM-DD`. */
  dueDate: string;
  timezone: string;
  /** Local `HH:MM` every step is sent at. */
  time: string;
  /** Days before the due date (0 = on the due date). */
  leadDays: readonly number[];
  /** Days after the due date that get a nudge (1..N). 0 for recurring items and for done reminders. */
  overdueNudges: number;
  /** `null` = quiet hours off. */
  quiet: QuietHours | null;
  /** Steps at or after this instant are dropped (recurring items: the poster moves the item on at 06:00 on the due date). */
  cutoffMs?: number | undefined;
}

export interface FireStep {
  atMs: number;
  kind: 'lead' | 'overdue';
  /** Lead days (kind lead) or days after the due date (kind overdue). */
  n: number;
  /** Dedupe suffix: `l<n>` or `o<n>`. */
  key: string;
}

/** Stored JSON -> lead days. Anything that is not a list of up to 5 unique ints 0..30 reads as `fallback`. */
export function parseLeadDays<F>(raw: unknown, fallback: F): number[] | F {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  if (!Array.isArray(value) || value.length > MAX_LEAD_ENTRIES) return fallback;
  if (!value.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_LEAD_DAYS)) return fallback;
  return new Set(value).size === value.length ? (value as number[]) : fallback;
}

/** `HH:MM` -> minutes since midnight; a malformed value falls back to 09:00. */
export function minutesOf(hm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 9 * 60;
}

/**
 * UTC instant of the wall-clock time `minutes` on a local date. A time skipped by a DST jump lands just after it (02:30 ->
 * 03:30); a repeated one resolves to its first occurrence.
 */
export function localInstantMs(tz: string, date: LocalDate, minutes: number): number {
  const wall = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  const first = wall - tzOffsetMs(tz, wall);
  const second = wall - tzOffsetMs(tz, first);
  return second + tzOffsetMs(tz, second) === wall ? second : Math.max(first, second);
}

/** Where a local date + time ends up after quiet hours: unchanged outside the window, the window's end inside it. */
function afterQuiet(date: LocalDate, minutes: number, quiet: QuietHours | null): { date: LocalDate; minutes: number } {
  if (!quiet) return { date, minutes };
  const start = minutesOf(quiet.start);
  const end = minutesOf(quiet.end);
  if (start === end) return { date, minutes };
  if (start < end) return minutes >= start && minutes < end ? { date, minutes: end } : { date, minutes };
  // Crosses midnight: [start, 24:00) belongs to the window that ends tomorrow, [00:00, end) to the one that ends today.
  if (minutes >= start) return { date: addDays(date, 1), minutes: end };
  if (minutes < end) return { date, minutes: end };
  return { date, minutes };
}

/**
 * A lead step is never sent after the due date's local day: one that quiet hours would push into the next day (an evening
 * time on the due date) is sent just before the quiet window starts instead. Overdue nudges may move on to a later morning.
 */
function stepInstant(input: ScheduleInput, date: LocalDate, isLead: boolean): number {
  const moved = afterQuiet(date, minutesOf(input.time), input.quiet);
  if (isLead && input.quiet && dateKey(moved.date) > input.dueDate) {
    return localInstantMs(input.timezone, date, minutesOf(input.quiet.start) - 1);
  }
  return localInstantMs(input.timezone, moved.date, moved.minutes);
}

/** Every instant of the current occurrence, oldest first (leads before nudges when two coincide). */
export function fireSteps(input: ScheduleInput): FireStep[] {
  const due = parseDateKey(input.dueDate);
  const steps: FireStep[] = [];
  for (const l of input.leadDays) steps.push({ atMs: stepInstant(input, addDays(due, -l), true), kind: 'lead', n: l, key: `l${l}` });
  for (let k = 1; k <= input.overdueNudges; k += 1) steps.push({ atMs: stepInstant(input, addDays(due, k), false), kind: 'overdue', n: k, key: `o${k}` });
  const kept = input.cutoffMs === undefined ? steps : steps.filter((s) => s.atMs < (input.cutoffMs as number));
  return kept.sort((a, b) => a.atMs - b.atMs || (a.kind === b.kind ? (a.kind === 'lead' ? b.n - a.n : a.n - b.n) : a.kind === 'lead' ? -1 : 1));
}

/**
 * When a repeating reminder moves on: the start of the day after its last possible nudge, but never before its last
 * step (a step shifted by quiet hours can land after that midnight).
 */
export function rollAtMs(input: ScheduleInput, steps: readonly FireStep[] = fireSteps(input)): number {
  const afterNudges = startOfLocalDay(input.timezone, addDays(parseDateKey(input.dueDate), input.overdueNudges + 1));
  const last = steps.reduce((max, s) => Math.max(max, s.atMs), -Infinity);
  return Math.max(afterNudges, last + 1);
}

/** First instant strictly after `afterMs` (a step, or for a repeating reminder the roll), or null when nothing is left. */
export function nextFireMs(input: ScheduleInput, afterMs: number, repeating: boolean): number | null {
  const steps = fireSteps(input);
  const times = steps.map((s) => s.atMs);
  if (repeating) times.push(rollAtMs(input, steps));
  const later = times.filter((t) => t > afterMs);
  return later.length > 0 ? Math.min(...later) : null;
}

export interface DueNow {
  /** The latest step in `(afterMs, nowMs]`: when several are due (the cron was down) only this one is sent. */
  step: FireStep | null;
  /** A repeating reminder whose roll instant has arrived: move it to the next occurrence. */
  roll: boolean;
}

/**
 * What to do at `nowMs` for a reminder whose last sent instant is `afterMs` (-Infinity = none yet). When the roll is due
 * the occurrence is over, so a stale step is dropped rather than sent.
 */
export function dueNow(input: ScheduleInput, afterMs: number, nowMs: number, repeating: boolean): DueNow {
  const steps = fireSteps(input);
  const roll = repeating && (() => {
    const at = rollAtMs(input, steps);
    return at > afterMs && at <= nowMs;
  })();
  const due = steps.filter((s) => s.atMs > afterMs && s.atMs <= nowMs);
  return { step: roll ? null : (due[due.length - 1] ?? null), roll };
}

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();
const clamped = (year: number, month: number, day: number): LocalDate => ({ year, month, day: Math.min(day, daysInMonth(year, month)) });

/**
 * The occurrence after `due`: +7 days, or the next month / year on `anchorDay` (clamped: 31 -> Feb 28/29, and back to the
 * 31st in the next long month). Never a date before `today`, so a long-missed reminder is not backfilled.
 */
export function advanceDue(cadence: Exclude<ReminderCadence, 'none'>, anchorDay: number, due: LocalDate, today: LocalDate): LocalDate {
  const step = (d: LocalDate): LocalDate => {
    if (cadence === 'weekly') return addDays(d, 7);
    if (cadence === 'yearly') return clamped(d.year + 1, d.month, anchorDay);
    return d.month === 12 ? clamped(d.year + 1, 1, anchorDay) : clamped(d.year, d.month + 1, anchorDay);
  };
  let next = step(due);
  for (let i = 0; i < 1200 && dateKey(next) < dateKey(today); i += 1) next = step(next);
  return next;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / (24 * 60 * MINUTE_MS));
}

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseDateKey(value);
  return dateKey(addDays(d, 0)) === value;
}
