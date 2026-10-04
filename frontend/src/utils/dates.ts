import {
  addDays,
  addMonths,
  formatISO,
  parse,
  startOfDay,
  startOfMonth,
} from "date-fns";

/** ISO range for a calendar month: half-open `[from, to)` where `to` is the next month's start. */
export function monthRangeIso(year: number, monthIndex0: number) {
  const start = startOfMonth(new Date(year, monthIndex0, 1));
  const nextMonthStart = addMonths(start, 1);
  return {
    from: formatISO(start),
    to: formatISO(nextMonthStart),
  };
}

/** ISO range for a local calendar day (`yyyy-MM-dd`): half-open `[from, to)`. */
export function dayRangeIso(dayKey: string) {
  const start = startOfDay(parse(dayKey, "yyyy-MM-dd", new Date()));
  return {
    from: formatISO(start),
    to: formatISO(addDays(start, 1)),
  };
}
