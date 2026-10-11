import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { useBentoMonthSelection } from "@/components/bento";
import type {
  InsightsCashflowDaySelection,
  InsightsMonthSummary,
} from "@/features/analytics/components";
import { useDeferredHeavyCharts } from "@/features/analytics/hooks/useDeferredHeavyCharts";
import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import { isPastMonth } from "@/features/analytics/utils/buildCashflowWindow";
import {
  topPayeeKeysFromSpend,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { buildInsightsMonthSummary } from "@/features/analytics/utils/buildInsightsMonthSummary";
import type { CompareMonthParam } from "@/features/analytics/utils/compareMonths";
import { computeBurnRateMetrics } from "@/features/analytics/utils/computeBurnRateMetrics";
import { buildEmptyBurnRateMetrics } from "@/features/analytics/utils/insightsEmptyState";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import type { TransactionRow } from "@/features/transactions/types";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";

type AnalyticsScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Insights">,
  NativeStackNavigationProp<MainStackParamList>
>;

export function useAnalyticsScreenModel() {
  const navigation = useNavigation<AnalyticsScreenNavigation>();
  const { onManualAdd, onReceipt, onVoice } =
    useTransactionQuickAddActions(navigation);
  const {
    monthOptions,
    selectedMonth,
    selectMonth: handleSelectMonth,
  } = useBentoMonthSelection();

  const selectedMonthIndex = useMemo(
    () => monthOptions.findIndex((m) => m.label === selectedMonth.label),
    [monthOptions, selectedMonth.label],
  );
  const canGoPrevMonth = selectedMonthIndex < monthOptions.length - 1;
  const canGoNextMonth = selectedMonthIndex > 0;
  const goPrevMonth = useCallback(() => {
    if (canGoPrevMonth) handleSelectMonth(selectedMonthIndex + 1);
  }, [canGoPrevMonth, handleSelectMonth, selectedMonthIndex]);
  const goNextMonth = useCallback(() => {
    if (canGoNextMonth) handleSelectMonth(selectedMonthIndex - 1);
  }, [canGoNextMonth, handleSelectMonth, selectedMonthIndex]);

  const insightsQuery = useMonthInsightsQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();

  const insightsData = insightsQuery.data;
  const budgetMonthly = budgetResp?.budget?.monthly_budget ?? null;
  const existingBudget = budgetMonthly ? Number.parseFloat(budgetMonthly) : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  const insightsLoading = insightsQuery.isPending && !insightsQuery.data;
  // isPlaceholderData is true while keepPreviousData serves the old month's
  // data during a month switch — treat it the same as a first-load spinner.
  const isTransitioning = insightsQuery.isPlaceholderData;
  const summaryLoading =
    insightsLoading ||
    isTransitioning ||
    (isBudgetLoading && budgetResp === undefined);
  const summaryFailed = insightsQuery.isError;
  const chartLoading = insightsLoading || isTransitioning;
  const chartsDataSettled =
    Boolean(insightsData) && !insightsQuery.isPlaceholderData && !chartLoading;

  const dailyCashflow = useMemo(
    () => insightsData?.daily_cashflow ?? [],
    [insightsData?.daily_cashflow],
  );
  const counterpartySpend = useMemo(
    () => insightsData?.counterparty_spend ?? [],
    [insightsData?.counterparty_spend],
  );
  const counterpartyIncome = useMemo(
    () => insightsData?.counterparty_income ?? [],
    [insightsData?.counterparty_income],
  );
  const topPayeeKeys = useMemo(
    () => topPayeeKeysFromSpend(counterpartySpend),
    [counterpartySpend],
  );
  const topExpenses: TransactionRow[] = insightsData?.top_expenses ?? [];

  const summary = useMemo((): InsightsMonthSummary | null => {
    if (summaryLoading || summaryFailed) return null;
    const isPast = isPastMonth(selectedMonth.year, selectedMonth.monthIndex0);
    return buildInsightsMonthSummary(
      insightsData?.summary,
      hasMonthlyBudget,
      monthlyBudgetAmount,
      isPast,
    );
  }, [
    hasMonthlyBudget,
    insightsData?.summary,
    monthlyBudgetAmount,
    selectedMonth.year,
    selectedMonth.monthIndex0,
    summaryFailed,
    summaryLoading,
  ]);

  const burnRateMetrics = useMemo(() => {
    if (chartLoading) return null;
    if (summaryFailed)
      return buildEmptyBurnRateMetrics(
        hasMonthlyBudget,
        hasMonthlyBudget ? monthlyBudgetAmount : null,
      );
    const computed = computeBurnRateMetrics(
      dailyCashflow,
      hasMonthlyBudget ? monthlyBudgetAmount : null,
      selectedMonth.year,
      selectedMonth.monthIndex0,
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
    selectedMonth.monthIndex0,
    selectedMonth.year,
    summaryFailed,
  ]);

  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      navigation.navigate("TransactionDetail", { transaction });
    },
    [navigation],
  );

  const openTransactionsListForDay = useCallback(
    (day: InsightsCashflowDaySelection) => {
      navigation.navigate("TransactionsList", {
        filter: "day",
        year: selectedMonth.year,
        monthIndex0: selectedMonth.monthIndex0,
        dayKey: day.date,
      });
    },
    [navigation, selectedMonth.monthIndex0, selectedMonth.year],
  );

  const openTransactionsListForPayee = useCallback(
    (slice: CounterpartyDonutDatum) => {
      navigation.navigate("TransactionsList", {
        filter: "payee",
        year: selectedMonth.year,
        monthIndex0: selectedMonth.monthIndex0,
        payeeId: slice.payee_key,
        payeeDisplayName: slice.display_name,
        payeeKeysTop: topPayeeKeys,
      });
    },
    [navigation, selectedMonth.monthIndex0, selectedMonth.year, topPayeeKeys],
  );

  const openInsightsMonthCompare = useCallback(
    (monthA: CompareMonthParam, monthB: CompareMonthParam) => {
      navigation.navigate("InsightsMonthCompare", { monthA, monthB });
    },
    [navigation],
  );

  const { chartsReady } = useDeferredHeavyCharts(Boolean(insightsData));

  return {
    chartsReady,
    chartsDataSettled,
    monthOptions,
    selectedMonth,
    selectedMonthIndex,
    handleSelectMonth,
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth,
    goNextMonth,
    openInsightsMonthCompare,
    openTransactionDetail,
    openTransactionsListForDay,
    openTransactionsListForPayee,
    summary,
    summaryLoading,
    summaryFailed,
    hasMonthlyBudget,
    dailyCashflow,
    chartLoading,
    burnRateMetrics,
    chartYear: selectedMonth.year,
    chartMonthIndex0: selectedMonth.monthIndex0,
    counterpartySpend,
    counterpartyIncome,
    topExpenses,
    onManualAdd,
    onReceipt,
    onVoice,
  };
}
