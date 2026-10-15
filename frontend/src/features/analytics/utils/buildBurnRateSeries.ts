import { paiseToRupees, toPaise } from "@/utils/paise";

import type { DailyCashflowRow } from "../types";
import { fixedPlanPaise, type FixedPlanItem } from "./fixedPlan";

export type BurnRatePoint = {
  day: number;
  spent: number;
  /**
   * Ideal cumulative spend by the end of this day; null when no budget. Fixed costs step up on their due
   * day, the rest of the budget is spread evenly over the month.
   */
  pace: number | null;
};

/**
 * Cumulative spend per day plus the ideal pace line.
 *
 * ideal(d) = fixed amounts due on or before d + max(0, budget - fixed plan) * d / daysInMonth.
 * With no fixed items this is the plain straight line budget * d / daysInMonth.
 */
export function buildBurnRateSeries(
  dailyCashflow: DailyCashflowRow[],
  monthlyBudget: number | null,
  fixedItems: readonly FixedPlanItem[] = [],
): BurnRatePoint[] {
  const budget =
    monthlyBudget != null && Number.isFinite(monthlyBudget) && monthlyBudget > 0
      ? monthlyBudget
      : null;
  const dayCount = dailyCashflow.length;
  const budgetPaise = budget != null ? Math.round(budget * 100) : 0;
  const allowancePaise = Math.max(0, budgetPaise - fixedPlanPaise(fixedItems));
  let cumulativePaise = 0;

  return dailyCashflow.map((row, index) => {
    cumulativePaise += Math.abs(toPaise(row.debit_total));
    const day = index + 1;
    let pace: number | null = null;
    if (budget != null && dayCount > 0) {
      const dueSoFar = fixedPlanPaise(fixedItems, (item) => item.day <= day);
      pace = paiseToRupees(
        dueSoFar + Math.round((allowancePaise * day) / dayCount),
      );
    }
    return { day, spent: paiseToRupees(cumulativePaise), pace };
  });
}
