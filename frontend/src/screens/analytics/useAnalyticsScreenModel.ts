import { useMemo } from "react";

import { useBentoMonthSelection } from "@/components/bento";
import type { InsightsMonthSummary } from "@/features/analytics/components";
import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import { computeBurnRateMetrics } from "@/features/analytics/utils/computeBurnRateMetrics";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

export function useAnalyticsScreenModel() {
  const {
    monthOptions,
    selectedMonth,
    selectMonth: handleSelectMonth,
  } = useBentoMonthSelection();

  const insightsQuery = useMonthInsightsQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();

  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  const summary = useMemo((): InsightsMonthSummary | null => {
    const data = insightsQuery.data?.summary;
    if (!data) {
      return null;
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
    return {
      transactionCount: data.transaction_count,
      hasMonthlyBudget,
      isOverBudget,
      budgetDisplay: hasMonthlyBudget
        ? formatInrCompact(monthlyBudgetAmount)
        : "\u2014",
      usedPctDisplay,
      remainingValue,
      remainingLabel: isOverBudget ? "Over" : "Remaining",
      remainingDisplay: !hasMonthlyBudget
        ? "\u2014"
        : isOverBudget
          ? formatInrCompact(overageValue)
          : formatInrCompact(remainingValue),
      spentDisplay: formatSpendMagnitude(data.debit_total),
      incomeDisplay: formatSpendMagnitude(data.credit_total),
      netDisplay: formatNetDisplay(data.net),
      netValue,
    };
  }, [hasMonthlyBudget, insightsQuery.data?.summary, monthlyBudgetAmount]);

  const summaryLoading =
    insightsQuery.isPending || (isBudgetLoading && budgetResp === undefined);
  const summaryFailed = insightsQuery.isError;

  const dailyCashflow = insightsQuery.data?.daily_cashflow ?? [];
  const chartLoading = insightsQuery.isPending;
  const showInsightsBlocks =
    !insightsQuery.isError &&
    !insightsQuery.isPending &&
    (insightsQuery.data?.summary.transaction_count ?? 0) > 0;

  const burnRateMetrics = useMemo(
    () =>
      showInsightsBlocks
        ? computeBurnRateMetrics(
            dailyCashflow,
            hasMonthlyBudget ? monthlyBudgetAmount : null,
            selectedMonth.year,
            selectedMonth.monthIndex0,
          )
        : null,
    [
      dailyCashflow,
      hasMonthlyBudget,
      monthlyBudgetAmount,
      selectedMonth.monthIndex0,
      selectedMonth.year,
      showInsightsBlocks,
    ],
  );

  return {
    monthOptions,
    selectedMonth,
    handleSelectMonth,
    summary,
    summaryLoading,
    summaryFailed,
    hasMonthlyBudget,
    dailyCashflow,
    chartLoading,
    showInsightsBlocks,
    burnRateMetrics,
    chartYear: selectedMonth.year,
    chartMonthIndex0: selectedMonth.monthIndex0,
  };
}
