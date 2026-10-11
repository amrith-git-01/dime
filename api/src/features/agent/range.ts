import { addDays } from '../../core/timezone';
import type { LocalDate } from '../../core/timezone';
import { daysInMonth, isoDate, today } from './dates';

/**
 * Deterministic time hints for the pre-pass: relative phrases and month names in the question become an
 * inclusive local date range, with no LLM call. It is a HINT: the model is told the finer dates in the
 * question win, and anything ambiguous (a comparison, two separate months, a day of month) yields null.
 */

export interface DateRange {
  /** Inclusive local dates `YYYY-MM-DD`. */
  from: string;
  to: string;
  label: string;
}

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;
const MONTH_TITLES = MONTH_NAMES.map((m) => m.charAt(0).toUpperCase() + m.slice(1));

const MONTH_WORD =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTH_RE = new RegExp(`\\b${MONTH_WORD}\\b(?:[\\s,]+(20\\d{2}))?`, 'gi');
const MONTH_RANGE_RE = new RegExp(`\\b${MONTH_WORD}\\b(?:[\\s,]+(20\\d{2}))?\\s*(?:to|through|until|till|-|–)\\s*${MONTH_WORD}\\b(?:[\\s,]+(20\\d{2}))?`, 'i');
const DAY_OF_MONTH_RE = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_WORD}\\b|\\b${MONTH_WORD}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'i');
const COMPARE_RE = /\b(?:vs\.?|versus|compare[sd]?|comparison|against|than|chang(?:e|ed|es)|differ(?:ence|ent)?|higher|lower|increase[sd]?|decrease[sd]?)\b/i;
const ISO_RE = /\b\d{4}-\d{2}-\d{2}\b/;

const monthIndex = (word: string): number => MONTH_NAMES.findIndex((m) => m.startsWith(word.toLowerCase().slice(0, 3))) + 1;

function monthRange(year: number, month: number): DateRange {
  return {
    from: isoDate({ year, month, day: 1 }),
    to: isoDate({ year, month, day: daysInMonth(year, month) }),
    label: `${MONTH_TITLES[month - 1] ?? ''} ${year}`,
  };
}

/** Year of a month name that came without one: the latest occurrence that has started (not in the future). */
function inferYear(month: number, now: LocalDate): number {
  return month > now.month ? now.year - 1 : now.year;
}

function addMonths(date: LocalDate, delta: number): LocalDate {
  const index = date.year * 12 + (date.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

const spanLabel = (from: LocalDate, to: LocalDate, prefix: string) => `${prefix} (${isoDate(from)} to ${isoDate(to)})`;

/** A bare "may" is usually the verb: only a month when introduced by a preposition or followed by a year. */
function isMonthMention(match: RegExpExecArray, text: string): boolean {
  if ((match[1] ?? '').toLowerCase() !== 'may') return true;
  if (match[2]) return true;
  return /\b(?:in|for|during|of|from|since|until|to|last|this)\s+$/i.test(text.slice(0, match.index));
}

export function parseTimeHint(text: string, tz: string, nowMs: number): DateRange | null {
  const t = text.toLowerCase();
  const now = today(tz, nowMs);
  if (ISO_RE.test(t) || DAY_OF_MONTH_RE.test(t) || COMPARE_RE.test(t)) return null;

  const lastN = /\b(?:last|past)\s+(\d{1,3})\s+(day|week|month)s?\b/.exec(t);
  if (lastN) {
    const n = Number(lastN[1]);
    if (n < 1) return null;
    const unit = lastN[2];
    const from = unit === 'day' ? addDays(now, -(n - 1)) : unit === 'week' ? addDays(now, -(n * 7 - 1)) : addDays(addMonths(now, -n), 1);
    return { from: isoDate(from), to: isoDate(now), label: spanLabel(from, now, `last ${n} ${unit}${n === 1 ? '' : 's'}`) };
  }
  if (/\b(?:last|past)\s+(?:week|7 days)\b/.test(t)) {
    const from = addDays(now, -6);
    return { from: isoDate(from), to: isoDate(now), label: spanLabel(from, now, 'last 7 days') };
  }
  if (/\bthis\s+week\b/.test(t)) {
    const sinceMonday = (new Date(Date.UTC(now.year, now.month - 1, now.day)).getUTCDay() + 6) % 7;
    const from = addDays(now, -sinceMonday);
    return { from: isoDate(from), to: isoDate(now), label: spanLabel(from, now, 'this week') };
  }
  if (/\byesterday\b/.test(t)) {
    const d = addDays(now, -1);
    return { from: isoDate(d), to: isoDate(d), label: `yesterday (${isoDate(d)})` };
  }
  if (/\btoday\b/.test(t)) return { from: isoDate(now), to: isoDate(now), label: `today (${isoDate(now)})` };
  if (/\b(?:this|current)\s+month\b/.test(t)) return { ...monthRange(now.year, now.month), label: `this month (${MONTH_TITLES[now.month - 1] ?? ''} ${now.year})` };
  if (/\b(?:last|previous|prior)\s+month\b/.test(t)) {
    const prev = addMonths({ ...now, day: 1 }, -1);
    return { ...monthRange(prev.year, prev.month), label: `last month (${MONTH_TITLES[prev.month - 1] ?? ''} ${prev.year})` };
  }
  if (/\b(?:this|current)\s+year\b|\byear\s+to\s+date\b|\bytd\b/.test(t)) {
    return { from: isoDate({ year: now.year, month: 1, day: 1 }), to: isoDate(now), label: `${now.year} so far` };
  }
  if (/\b(?:last|previous|prior)\s+year\b/.test(t)) {
    return { from: `${now.year - 1}-01-01`, to: `${now.year - 1}-12-31`, label: String(now.year - 1) };
  }

  const span = MONTH_RANGE_RE.exec(t);
  if (span && isMonthMention(span, t)) {
    const m1 = monthIndex(span[1] ?? '');
    const m2 = monthIndex(span[3] ?? '');
    if (m1 > 0 && m2 > 0) {
      const y2 = span[4] ? Number(span[4]) : span[2] ? Number(span[2]) : inferYear(m2, now);
      const y1 = span[2] ? Number(span[2]) : m1 <= m2 ? y2 : y2 - 1;
      const first = monthRange(y1, m1);
      const last = monthRange(y2, m2);
      if (first.from <= last.to) return { from: first.from, to: last.to, label: `${MONTH_TITLES[m1 - 1] ?? ''} ${y1} to ${MONTH_TITLES[m2 - 1] ?? ''} ${y2}` };
    }
  }

  const found = new Map<string, DateRange>();
  for (const match of t.matchAll(MONTH_RE)) {
    if (!isMonthMention(match, t)) continue;
    const month = monthIndex(match[1] ?? '');
    if (month < 1) continue;
    const range = monthRange(match[2] ? Number(match[2]) : inferYear(month, now), month);
    found.set(range.from, range);
  }
  if (found.size === 1) return [...found.values()][0] ?? null;

  const yearOnly = /\b(?:in|for|during)\s+(20\d{2})\b/.exec(t);
  if (found.size === 0 && yearOnly) return { from: `${yearOnly[1]}-01-01`, to: `${yearOnly[1]}-12-31`, label: yearOnly[1] ?? '' };
  return null;
}
