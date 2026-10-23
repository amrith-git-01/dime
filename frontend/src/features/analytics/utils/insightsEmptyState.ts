import { formatInrCompact } from "@/utils/currency";
import type { MonthInsights } from "../types";
import type { InsightsMonthSummary } from "../components/InsightsMonthSummaryCard";

const EM_DASH = "\u2014";
const ZERO = formatInrCompact(0);

/** The month loaded and holds no transactions at all (not while loading, and not for a failed load). */
export function isInsightsMonthEmpty(
  insights: Pick<MonthInsights, "summary"> | undefined,
): boolean {
  return insights !== undefined && insights.summary.transaction_count === 0;
}

export function buildEmptyInsightsMonthSummary(
  hasMonthlyBudget: boolean,
  monthlyBudgetAmount: number,
): InsightsMonthSummary {
  return {
    transactionCount: 0,
    hasMonthlyBudget,
    hasIncome: false,
    isOverBudget: false,
    budgetDisplay: hasMonthlyBudget
      ? formatInrCompact(monthlyBudgetAmount)
      : EM_DASH,
    usedPctDisplay: hasMonthlyBudget ? "0%" : EM_DASH,
    remainingValue: 0,
    remainingLabel: "Remaining",
    remainingDisplay: hasMonthlyBudget
      ? formatInrCompact(monthlyBudgetAmount)
      : EM_DASH,
    spentDisplay: ZERO,
    incomeDisplay: ZERO,
    netDisplay: ZERO,
    heroDisplay: ZERO,
    netValue: 0,
    savingsRatePct: null,
    hasFixed: false,
    fixedDisplay: ZERO,
    flexibleDisplay: ZERO,
    expectedIncomeDisplay: null,
  };
}
