import { format, startOfMonth, subMonths } from "date-fns";

export type MonthOption = {
  label: string;
  year: number;
  monthIndex0: number;
};

/** Last six calendar months including current (newest first). */
export function buildMonthOptions(now: Date = new Date()): MonthOption[] {
  const startCurrent = startOfMonth(now);
  return Array.from({ length: 6 }, (_, index) => {
    const d = subMonths(startCurrent, index);
    return {
      label: format(d, "MMM yyyy"),
      year: d.getFullYear(),
      monthIndex0: d.getMonth(),
    };
  });
}
