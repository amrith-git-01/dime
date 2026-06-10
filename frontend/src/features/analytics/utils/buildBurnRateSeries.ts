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
  let cumulative = 0;

  return dailyCashflow.map((row, index) => {
    const debit = Math.abs(Number.parseFloat(row.debit_total));
    cumulative += Number.isFinite(debit) ? debit : 0;
    const day = index + 1;
    const pace =
      budget != null && dayCount > 0 ? (budget / dayCount) * day : null;
    return { day, spent: cumulative, pace };
  });
}
