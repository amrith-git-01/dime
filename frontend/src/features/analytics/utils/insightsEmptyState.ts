import { formatInrCompact } from "@/utils/currency";
import type { InsightsMonthSummary } from "../components/InsightsMonthSummaryCard";
import type { InsightsBurnRateMetrics } from "./computeBurnRateMetrics";

const EM_DASH = "\u2014";

export function buildEmptyInsightsMonthSummary(
  hasMonthlyBudget: boolean,
  monthlyBudgetAmount: number,
): InsightsMonthSummary {
  return {
    transactionCount: 0,
    hasMonthlyBudget,
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
    spentDisplay: EM_DASH,
    incomeDisplay: EM_DASH,
    netDisplay: EM_DASH,
    netValue: 0,
  };
}

export function buildEmptyBurnRateMetrics(
  hasMonthlyBudget: boolean,
  monthlyBudgetAmount: number | null,
): InsightsBurnRateMetrics {
  const budget =
    hasMonthlyBudget &&
    monthlyBudgetAmount != null &&
    Number.isFinite(monthlyBudgetAmount) &&
    monthlyBudgetAmount > 0
      ? monthlyBudgetAmount
      : null;

  return {
    spentSoFar: 0,
    spentDisplay: EM_DASH,
    idealPace: null,
    idealDisplay: EM_DASH,
    idealLabel: hasMonthlyBudget ? "Ideal by today" : "Ideal by today",
    hasMonthlyBudget: budget != null,
    monthlyBudget: budget,
    isOverPace: false,
    projected: 0,
    projectedDisplay: EM_DASH,
    projectedLabel: "At this pace",
  };
}
