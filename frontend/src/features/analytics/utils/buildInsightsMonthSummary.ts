import type { InsightsMonthSummary } from "@/features/analytics/components";
import type { InsightsSummary } from "@/features/analytics/types";
import type { MonthBudget } from "@/features/budgets/utils/monthBudget";
import { buildEmptyInsightsMonthSummary } from "@/features/analytics/utils/insightsEmptyState";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

export type InsightsSummaryExtras = {
  /** Fixed income still to come this month (rupees). */
  expectedIncome?: number;
};

const num = (raw: string | undefined): number => {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? Math.abs(n) : 0;
};

export function buildInsightsMonthSummary(
  data: InsightsSummary | undefined,
  /** The month's budget numbers (`resolveMonthBudget` of that month's server picture): never worked out here. */
  month: MonthBudget,
  isPast: boolean,
  extras: InsightsSummaryExtras = {},
): InsightsMonthSummary {
  if (!data || data.transaction_count === 0) {
    return buildEmptyInsightsMonthSummary(month.hasBudget, month.budget);
  }
  const netValue = (() => {
    const n = Number.parseFloat(data.net);
    return Number.isFinite(n) ? n : 0;
  })();
  const spentMonthNum = num(data.debit_total);
  const incomeNum = Number.parseFloat(data.credit_total);
  const hasIncome = Number.isFinite(incomeNum) && incomeNum > 0;
  const savingsRatePct = hasIncome
    ? Math.round((netValue / incomeNum) * 100)
    : null;
  // The headline is always what was spent; net is the secondary number.
  const spentDisplay = formatSpendMagnitude(data.debit_total);
  const netDisplay = formatNetDisplay(data.net);

  // With a budget the split bar is the budget (recurring that counts toward it plus everyday spend); without
  // one it splits the whole month's spend.
  const fixedTotal = Math.min(num(data.fixed_debit_total), spentMonthNum);
  const fixedSpent = month.hasBudget ? month.recurringInBudget : fixedTotal;
  const flexibleSpent = month.hasBudget
    ? month.flexibleInBudget
    : Math.max(0, spentMonthNum - fixedTotal);
  const expectedIncome = !isPast ? Math.max(0, extras.expectedIncome ?? 0) : 0;

  return {
    transactionCount: data.transaction_count,
    hasMonthlyBudget: month.hasBudget,
    hasIncome,
    isOverBudget: month.isOver,
    budgetDisplay: month.hasBudget ? formatInrCompact(month.budget) : "\u2014",
    budgetValue: month.budget,
    usedPctDisplay: month.hasBudget ? `${month.usedPercent}%` : "\u2014",
    remainingValue: month.left !== null && month.left > 0 ? month.left : 0,
    remainingLabel: month.isOver
      ? "Over budget"
      : isPast
        ? "Saved"
        : "Remaining",
    remainingDisplay: !month.hasBudget
      ? "\u2014"
      : month.isOver
        ? formatInrCompact(month.overBy)
        : formatInrCompact(month.left ?? 0),
    budgetLeft: month.left,
    spentDisplay,
    incomeDisplay: formatSpendMagnitude(data.credit_total),
    netDisplay,
    netValue,
    savingsRatePct,
    hasFixed: fixedTotal > 0 || month.committed > 0,
    fixedDisplay: formatInrCompact(fixedSpent),
    flexibleDisplay: formatInrCompact(flexibleSpent),
    fixedValue: fixedSpent,
    flexibleValue: flexibleSpent,
    expectedIncomeDisplay:
      expectedIncome > 0 ? formatInrCompact(expectedIncome) : null,
  };
}
