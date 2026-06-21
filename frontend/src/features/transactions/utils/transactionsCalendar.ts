import { endOfMonth, format } from "date-fns";

export type MonthDayBounds = {
  startKey: string;
  endKey: string;
};

/** Local calendar day as yyyy-MM-dd. */
export function todayDayKey(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

/** True when `dayKey` is after the local calendar today. */
export function isFutureDayKey(
  dayKey: string,
  now: Date = new Date(),
): boolean {
  return dayKey > todayDayKey(now);
}

/** Inclusive yyyy-MM-dd bounds for every day in a calendar month. */
export function buildMonthDayBounds(
  year: number,
  monthIndex0: number,
): MonthDayBounds {
  const anchor = new Date(year, monthIndex0, 1);
  return {
    startKey: format(anchor, "yyyy-MM-dd"),
    endKey: format(endOfMonth(anchor), "yyyy-MM-dd"),
  };
}

export function isDayKeyInMonth(
  dayKey: string,
  year: number,
  monthIndex0: number,
): boolean {
  const { startKey, endKey } = buildMonthDayBounds(year, monthIndex0);
  return dayKey >= startKey && dayKey <= endKey;
}
/**
 * Default day when entering a month on the Transactions calendar:
 * today for the current month, otherwise the last day of that month.
 */
export function resolveDefaultDayKeyForMonth(
  year: number,
  monthIndex0: number,
  now: Date = new Date(),
): string {
  if (now.getFullYear() === year && now.getMonth() === monthIndex0) {
    return format(now, "yyyy-MM-dd");
  }
  return buildMonthDayBounds(year, monthIndex0).endKey;
}
