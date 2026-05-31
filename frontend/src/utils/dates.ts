import { endOfMonth, formatISO, startOfMonth } from "date-fns";

/** ISO range for a calendar month (inclusive start, inclusive end). */
export function monthRangeIso(year: number, monthIndex0: number) {
  const start = startOfMonth(new Date(year, monthIndex0, 1));
  const end = endOfMonth(new Date(year, monthIndex0, 1));
  return {
    from: formatISO(start),
    to: formatISO(end),
  };
}
