import { format, subMonths } from "date-fns";

import type { InsightsSummary } from "@/features/analytics/types";
import type { MonthOption } from "@/utils/buildMonthOptions";
import { formatInrChartAxis } from "@/utils/currency";

export type CompareMonthParam = {
  year: number;
  monthIndex0: number;
  label: string;
};

export function monthOptionToCompareParam(
  month: MonthOption,
): CompareMonthParam {
  return {
    year: month.year,
    monthIndex0: month.monthIndex0,
    label: month.label,
  };
}

export function areCompareMonthsEqual(
  a: CompareMonthParam,
  b: CompareMonthParam,
): boolean {
  return a.year === b.year && a.monthIndex0 === b.monthIndex0;
}

/** Previous calendar month relative to A, else the next older option in the list. */
export function defaultCompareMonthBIndex(
  monthOptions: MonthOption[],
  monthAIndex: number,
): number {
  const monthA = monthOptions[monthAIndex];
  if (!monthA) {
    return Math.min(1, Math.max(0, monthOptions.length - 1));
  }
  const previous = subMonths(new Date(monthA.year, monthA.monthIndex0, 1), 1);
  const previousLabel = format(previous, "MMM yyyy");
  const previousIndex = monthOptions.findIndex(
    (month) => month.label === previousLabel,
  );
  if (previousIndex >= 0) {
    return previousIndex;
  }
  return Math.min(monthAIndex + 1, monthOptions.length - 1);
}

export function formatSpentDelta(
  summaryA: InsightsSummary | undefined,
  summaryB: InsightsSummary | undefined,
): string | null {
  if (!summaryA || !summaryB) {
    return null;
  }
  if (summaryA.transaction_count === 0 || summaryB.transaction_count === 0) {
    return null;
  }
  const spentA = Math.abs(Number.parseFloat(summaryA.debit_total));
  const spentB = Math.abs(Number.parseFloat(summaryB.debit_total));
  if (
    !Number.isFinite(spentA) ||
    !Number.isFinite(spentB) ||
    (spentA === 0 && spentB === 0)
  ) {
    return null;
  }

  const delta = spentA - spentB;
  const sign = delta > 0 ? "+" : delta < 0 ? "\u2212" : "";
  const amountLabel = formatInrChartAxis(Math.abs(delta));
  const pct = spentB > 0 ? Math.round((Math.abs(delta) / spentB) * 100) : null;
  const arrow = delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "";
  const pctPart = pct != null && pct > 0 ? ` (${arrow}${pct}%)` : "";

  return `Δ Spent ${sign}${amountLabel}${pctPart}`;
}
