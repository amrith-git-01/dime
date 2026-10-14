import type { InsightsMonthSummary } from "@/features/analytics/components";
import type { InsightsSummary } from "@/features/analytics/types";
import { buildEmptyInsightsMonthSummary } from "@/features/analytics/utils/insightsEmptyState";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

export type InsightsSummaryExtras = {
  /** Fixed income still to come this month (rupees). */
  expectedIncome?: number;
  /** Projected total spend for the month (rupees); null when unknown. */
  projectedSpend?: number | null;
};

const num = (raw: string | undefined): number => {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

export function buildInsightsMonthSummary(
  data: InsightsSummary | undefined,
  hasMonthlyBudget: boolean,
  monthlyBudgetAmount: number,
  isPast: boolean,
  extras: InsightsSummaryExtras = {},
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
  const spentDisplay = formatSpendMagnitude(data.debit_total);
  const netDisplay = formatNetDisplay(data.net);

  const fixedSpent = Math.min(num(data.fixed_debit_total), spentMonthNum);
  const flexibleSpent = Math.max(0, spentMonthNum - fixedSpent);
  const expectedIncome = !isPast ? Math.max(0, extras.expectedIncome ?? 0) : 0;
  const projectedSpend = !isPast ? (extras.projectedSpend ?? null) : null;
  const hasProjectedNet =
    projectedSpend != null && (expectedIncome > 0 || hasIncome);
  const projectedNetValue = hasProjectedNet
    ? (Number.isFinite(incomeNum) ? incomeNum : 0) +
      expectedIncome -
      projectedSpend
    : 0;

  return {
    transactionCount: data.transaction_count,
    hasMonthlyBudget,
    hasIncome,
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
    spentDisplay,
    incomeDisplay: formatSpendMagnitude(data.credit_total),
    netDisplay,
    heroDisplay: hasIncome ? netDisplay : spentDisplay,
    netValue,
    savingsRatePct,
    hasFixed: fixedSpent > 0,
    fixedDisplay: formatInrCompact(fixedSpent),
    flexibleDisplay: formatInrCompact(flexibleSpent),
    expectedIncomeDisplay:
      expectedIncome > 0 ? formatInrCompact(expectedIncome) : null,
    projectedNetDisplay: hasProjectedNet
      ? formatNetDisplay(projectedNetValue)
      : null,
    projectedNetValue,
  };
}
