/**
 * Month budget numbers shared by the Home hero and the Android home-screen widget snapshot, so
 * both always agree on "left" and progress. Inputs are API decimal strings.
 */
export type MonthlyBudgetMath = {
  monthlyBudget: number;
  spentMonthNum: number;
  hasMonthlyBudget: boolean;
  hasSpentMonth: boolean;
  /** Budget minus spend, never below 0; NaN without a budget or spend. */
  monthlyLeft: number;
  /** Spend over budget as 0..1; 0 without a budget or spend. */
  monthlyProgress: number;
};

export function computeMonthlyBudgetMath(
  monthlyBudgetRaw: string | null | undefined,
  spentThisMonthRaw: string | null | undefined,
): MonthlyBudgetMath {
  const monthlyBudget = monthlyBudgetRaw
    ? Number.parseFloat(monthlyBudgetRaw)
    : NaN;
  const spentMonthNum =
    spentThisMonthRaw !== undefined && spentThisMonthRaw !== null
      ? Math.abs(Number.parseFloat(spentThisMonthRaw))
      : NaN;
  const hasMonthlyBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0;
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const monthlyLeft =
    hasMonthlyBudget && hasSpentMonth
      ? Math.max(0, monthlyBudget - spentMonthNum)
      : NaN;
  const monthlyProgress =
    hasMonthlyBudget && hasSpentMonth
      ? Math.min(1, spentMonthNum / monthlyBudget)
      : 0;
  return {
    monthlyBudget,
    spentMonthNum,
    hasMonthlyBudget,
    hasSpentMonth,
    monthlyLeft,
    monthlyProgress,
  };
}
