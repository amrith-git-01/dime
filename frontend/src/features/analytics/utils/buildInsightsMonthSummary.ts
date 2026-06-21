import type { InsightsMonthSummary } from "@/features/analytics/components";
import type { InsightsSummary } from "@/features/analytics/types";
import { buildEmptyInsightsMonthSummary } from "@/features/analytics/utils/insightsEmptyState";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

export function buildInsightsMonthSummary(
  data: InsightsSummary | undefined,
  hasMonthlyBudget: boolean,
  monthlyBudgetAmount: number,
  isPast: boolean,
): InsightsMonthSummary {
  if (!data || data.transaction_count === 0) {
    return buildEmptyInsightsMonthSummary(
      hasMonthlyBudget,
      monthlyBudgetAmount,
    );
  }
  const netValue = (() => {
    const n = Number.parseFloat(data.net);
    return Number.isFinite(n) ? n : 0;
  })();
  const spentMonthNum = Math.abs(Number.parseFloat(data.debit_total));
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const isOverBudget =
    hasMonthlyBudget && hasSpentMonth && spentMonthNum > monthlyBudgetAmount;
  const remainingValue =
    hasMonthlyBudget && hasSpentMonth
      ? Math.max(0, monthlyBudgetAmount - spentMonthNum)
      : 0;
  const overageValue =
    isOverBudget && hasSpentMonth ? spentMonthNum - monthlyBudgetAmount : 0;
  const usagePct =
    hasMonthlyBudget && hasSpentMonth && monthlyBudgetAmount > 0
      ? Math.min(1, spentMonthNum / monthlyBudgetAmount)
      : 0;
  const usedPctDisplay = !hasMonthlyBudget
    ? "\u2014"
    : hasSpentMonth
      ? `${Math.round(usagePct * 100)}%`
      : "0%";
  const incomeNum = Number.parseFloat(data.credit_total);
  const hasIncome = Number.isFinite(incomeNum) && incomeNum > 0;
  const savingsRatePct = hasIncome
    ? Math.round((netValue / incomeNum) * 100)
    : null;

  return {
    transactionCount: data.transaction_count,
    hasMonthlyBudget,
    isOverBudget,
    budgetDisplay: hasMonthlyBudget
      ? formatInrCompact(monthlyBudgetAmount)
      : "\u2014",
    usedPctDisplay,
    remainingValue,
    remainingLabel: isOverBudget
      ? "Over budget"
      : isPast
        ? "Saved"
        : "Remaining",
    remainingDisplay: !hasMonthlyBudget
      ? "\u2014"
      : isOverBudget
        ? formatInrCompact(overageValue)
        : formatInrCompact(remainingValue),
    spentDisplay: formatSpendMagnitude(data.debit_total),
    incomeDisplay: formatSpendMagnitude(data.credit_total),
    netDisplay: formatNetDisplay(data.net),
    netValue,
    savingsRatePct,
  };
}
