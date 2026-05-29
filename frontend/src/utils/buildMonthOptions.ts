import { format, startOfMonth, subMonths } from "date-fns";

export type MonthOption = {
  label: string;
  year: number;
  monthIndex0: number;
};

/** Rolling calendar months including current (newest first). Default 6 for Budget. */
export function buildMonthOptions(
  count = 6,
  now: Date = new Date(),
): MonthOption[] {
  const startCurrent = startOfMonth(now);
  return Array.from({ length: count }, (_, index) => {
    const d = subMonths(startCurrent, index);
    return {
      label: format(d, "MMM yyyy"),
      year: d.getFullYear(),
      monthIndex0: d.getMonth(),
    };
  });
}
