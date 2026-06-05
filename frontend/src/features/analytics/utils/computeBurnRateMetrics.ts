import { formatInrCompact } from "@/utils/currency";

import type { DailyCashflowRow } from "../types";
import { buildBurnRateSeries } from "./buildBurnRateSeries";
import { calendarDaysInMonth, isCurrentMonth } from "./buildCashflowWindow";

export type InsightsBurnRateMetrics = {
  spentSoFar: number;
  spentDisplay: string;
  idealPace: number | null;
  idealDisplay: string;
  idealLabel: string;
  hasMonthlyBudget: boolean;
  monthlyBudget: number | null;
  isOverPace: boolean;
  projected: number;
  projectedDisplay: string;
  projectedLabel: string;
};

/** Pace KPIs from cumulative debit series (same math as the former burn-rate chart). */
export function computeBurnRateMetrics(
  dailyCashflow: DailyCashflowRow[],
  monthlyBudget: number | null,
  year: number,
  monthIndex0: number,
): InsightsBurnRateMetrics | null {
  const daysInMonth = calendarDaysInMonth(year, monthIndex0);
  if (daysInMonth < 1 || dailyCashflow.length === 0) {
    return null;
  }

  const budget =
    monthlyBudget != null && Number.isFinite(monthlyBudget) && monthlyBudget > 0
      ? monthlyBudget
      : null;
  const hasMonthlyBudget = budget != null;
  const current = isCurrentMonth(year, monthIndex0);
  const referenceDay = current
    ? Math.min(new Date().getDate(), daysInMonth)
    : daysInMonth;

  const points = buildBurnRateSeries(dailyCashflow, budget);
  const refPoint =
    points.find((p) => p.day === referenceDay) ?? points[points.length - 1];
  const spentSoFar = refPoint.spent;
  const idealPace = refPoint.pace;

  const dailyRate = referenceDay > 0 ? spentSoFar / referenceDay : 0;
  const projected = dailyRate * daysInMonth;

  const idealLabel = hasMonthlyBudget
    ? current
      ? "Ideal by today"
      : "Ideal"
    : "Ideal by today";

  return {
    spentSoFar,
    spentDisplay: formatInrCompact(spentSoFar),
    idealPace,
    idealDisplay: idealPace != null ? formatInrCompact(idealPace) : "\u2014",
    idealLabel,
    hasMonthlyBudget,
    monthlyBudget: budget,
    isOverPace: idealPace != null && idealPace > 0 && spentSoFar > idealPace,
    projected,
    projectedDisplay: formatInrCompact(projected),
    projectedLabel: "At this pace",
  };
}
