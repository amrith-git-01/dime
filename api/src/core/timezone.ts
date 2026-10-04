import { BadRequestError } from './errors';

/**
 * Calendar math in a named IANA timezone using only `Intl` (no date library, works in workerd).
 * Mirrors backend `features/transactions/time_bounds.py`, with one difference: ranges are returned
 * as UTC instants (`...Z`) instead of offset ISO strings; the instants are identical.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Validated timezone name. Throws 400 (`Invalid timezone: 'x'`) like Python's `parse_tz` ValueError. */
export function parseTimezone(name: string): string {
  const stripped = name.trim();
  if (!stripped) throw new BadRequestError('Timezone is required');
  try {
    formatter(stripped);
  } catch {
    throw new BadRequestError(`Invalid timezone: '${name}'`);
  }
  return stripped;
}

export interface LocalDate {
  year: number;
  month: number; // 1-12
  day: number;
}

interface LocalParts extends LocalDate {
  hour: number;
  minute: number;
  second: number;
}

function partsAt(tz: string, utcMs: number): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out['year'] ?? 1970,
    month: out['month'] ?? 1,
    day: out['day'] ?? 1,
    hour: (out['hour'] ?? 0) % 24,
    minute: out['minute'] ?? 0,
    second: out['second'] ?? 0,
  };
}

/** The calendar date (in `tz`) of an instant. */
export function localDate(tz: string, utcMs: number): LocalDate {
  const { year, month, day } = partsAt(tz, utcMs);
  return { year, month, day };
}

/** `tz` offset from UTC in ms at an instant (positive east of Greenwich). */
export function tzOffsetMs(tz: string, utcMs: number): number {
  const p = partsAt(tz, utcMs);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const DAY_MS = 86_400_000;

/**
 * UTC instant of `00:00` local on a calendar date. In a DST gap the offset before the transition is
 * used and an ambiguous (repeated) midnight resolves to its first occurrence, like Python's
 * `zoneinfo` with `fold=0`.
 */
export function startOfLocalDay(tz: string, date: LocalDate): number {
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const before = tzOffsetMs(tz, guess - DAY_MS);
  const after = tzOffsetMs(tz, guess + DAY_MS);
  const valid = [guess - before, guess - after].filter((candidate) => tzOffsetMs(tz, candidate) === guess - candidate);
  return valid.length > 0 ? Math.min(...valid) : guess - before;
}

/** Calendar arithmetic on a date (no timezone involved). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function dateKey(date: LocalDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export interface IsoRange {
  /** Inclusive lower bound, ISO-8601 UTC. */
  from: string;
  /** Exclusive upper bound, ISO-8601 UTC. */
  to: string;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** Half-open `[month start, next month start)` in `tz`. */
export function monthRange(tz: string, year: number, month: number): IsoRange {
  const next = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
  return { from: iso(startOfLocalDay(tz, { year, month, day: 1 })), to: iso(startOfLocalDay(tz, next)) };
}

/** Half-open `[day 00:00, next day 00:00)` in `tz`. */
export function dayRange(tz: string, date: LocalDate): IsoRange {
  return { from: iso(startOfLocalDay(tz, date)), to: iso(startOfLocalDay(tz, addDays(date, 1))) };
}

/** Half-open range covering `n` calendar days that end with (and include) `endDate`. */
export function lastNDaysRange(tz: string, endDate: LocalDate, n: number): IsoRange {
  return {
    from: iso(startOfLocalDay(tz, addDays(endDate, -(n - 1)))),
    to: iso(startOfLocalDay(tz, addDays(endDate, 1))),
  };
}
