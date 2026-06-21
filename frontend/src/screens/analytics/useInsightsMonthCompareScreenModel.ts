import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useLayoutEffect, useMemo } from "react";

import type { InsightsMonthSummary } from "@/features/analytics/components";
import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import { isPastMonth } from "@/features/analytics/utils/buildCashflowWindow";
import { buildInsightsMonthSummary } from "@/features/analytics/utils/buildInsightsMonthSummary";
import { formatSpentDelta } from "@/features/analytics/utils/compareMonths";
import {
  computeBurnRateMetrics,
  type InsightsBurnRateMetrics,
} from "@/features/analytics/utils/computeBurnRateMetrics";
import { buildEmptyBurnRateMetrics } from "@/features/analytics/utils/insightsEmptyState";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import type { MainStackParamList } from "@/navigation/types";

type CompareRoute = RouteProp<MainStackParamList, "InsightsMonthCompare">;

function useCompareMonthSide(
  year: number,
  monthIndex0: number,
  label: string,
  hasMonthlyBudget: boolean,
  monthlyBudgetAmount: number,
  isBudgetLoading: boolean,
  budgetRespUndefined: boolean,
) {
  const query = useMonthInsightsQuery(year, monthIndex0);

  const summaryLoading =
    query.isPending || (isBudgetLoading && budgetRespUndefined);
  const chartLoading = query.isPending;

  const summary = useMemo((): InsightsMonthSummary | null => {
    if (summaryLoading || query.isError) {
      return null;
    }
    return buildInsightsMonthSummary(
      query.data?.summary,
      hasMonthlyBudget,
      monthlyBudgetAmount,
      isPastMonth(year, monthIndex0),
    );
  }, [
    hasMonthlyBudget,
    monthlyBudgetAmount,
    query.data?.summary,
    query.isError,
    summaryLoading,
  ]);

  const dailyCashflow = useMemo(
    () => query.data?.daily_cashflow ?? [],
    [query.data?.daily_cashflow],
  );

  const burnRateMetrics = useMemo((): InsightsBurnRateMetrics | null => {
    if (chartLoading) {
      return null;
    }
    if (query.isError) {
      return buildEmptyBurnRateMetrics(
        hasMonthlyBudget,
        hasMonthlyBudget ? monthlyBudgetAmount : null,
      );
    }
    const computed = computeBurnRateMetrics(
      dailyCashflow,
      hasMonthlyBudget ? monthlyBudgetAmount : null,
      year,
      monthIndex0,
    );
    return (
      computed ??
      buildEmptyBurnRateMetrics(
        hasMonthlyBudget,
        hasMonthlyBudget ? monthlyBudgetAmount : null,
      )
    );
  }, [
    chartLoading,
    dailyCashflow,
    hasMonthlyBudget,
    monthlyBudgetAmount,
    monthIndex0,
    query.isError,
    year,
  ]);

  return {
    label,
    year,
    monthIndex0,
    isLoading: query.isPending,
    isError: query.isError,
    summaryLoading,
    chartLoading,
    summary,
    burnRateMetrics,
    dailyCashflow,
    counterpartySpend: query.data?.counterparty_spend ?? [],
    rawSummary: query.data?.summary,
  };
}

export function useInsightsMonthCompareScreenModel() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { params } = useRoute<CompareRoute>();

  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  const monthA = useCompareMonthSide(
    params.monthA.year,
    params.monthA.monthIndex0,
    params.monthA.label,
    hasMonthlyBudget,
    monthlyBudgetAmount,
    isBudgetLoading,
    budgetResp === undefined,
  );
  const monthB = useCompareMonthSide(
    params.monthB.year,
    params.monthB.monthIndex0,
    params.monthB.label,
    hasMonthlyBudget,
    monthlyBudgetAmount,
    isBudgetLoading,
    budgetResp === undefined,
  );

  const screenTitle = `${params.monthA.label} vs ${params.monthB.label}`;

  useLayoutEffect(() => {
    navigation.setOptions({ title: screenTitle });
  }, [navigation, screenTitle]);

  const spentDelta = useMemo(
    () => formatSpentDelta(monthA.rawSummary, monthB.rawSummary),
    [monthA.rawSummary, monthB.rawSummary],
  );

  const monthASpent = useMemo(
    () =>
      monthA.rawSummary
        ? Math.abs(Number.parseFloat(monthA.rawSummary.debit_total ?? "0"))
        : 0,
    [monthA.rawSummary],
  );

  const monthBSpent = useMemo(
    () =>
      monthB.rawSummary
        ? Math.abs(Number.parseFloat(monthB.rawSummary.debit_total ?? "0"))
        : 0,
    [monthB.rawSummary],
  );

  const isDeltaPositive = useMemo((): boolean | null => {
    if (!monthA.rawSummary || !monthB.rawSummary) return null;
    if (monthASpent < monthBSpent) return true;
    if (monthASpent > monthBSpent) return false;
    return null;
  }, [monthA.rawSummary, monthB.rawSummary, monthASpent, monthBSpent]);

  const bothFailed = monthA.isError && monthB.isError;

  return {
    monthA,
    monthB,
    spentDelta,
    bothFailed,
    monthASpent,
    monthBSpent,
    isDeltaPositive,
  };
}
