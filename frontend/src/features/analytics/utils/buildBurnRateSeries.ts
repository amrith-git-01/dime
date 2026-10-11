import { paiseToRupees, toPaise } from "@/utils/paise";

import type { DailyCashflowRow } from "../types";

export type BurnRatePoint = {
  day: number;
  spent: number;
  /** Linear pace to monthly budget; null when no budget. */
  pace: number | null;
};

export function buildBurnRateSeries(
  dailyCashflow: DailyCashflowRow[],
  monthlyBudget: number | null,
): BurnRatePoint[] {
  const budget =
    monthlyBudget != null && Number.isFinite(monthlyBudget) && monthlyBudget > 0
      ? monthlyBudget
      : null;
  const dayCount = dailyCashflow.length;
  let cumulativePaise = 0;

  return dailyCashflow.map((row, index) => {
    cumulativePaise += Math.abs(toPaise(row.debit_total));
    const day = index + 1;
    const pace =
      budget != null && dayCount > 0 ? (budget / dayCount) * day : null;
    return { day, spent: paiseToRupees(cumulativePaise), pace };
  });
}
