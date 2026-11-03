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
import { COUNTERPARTY_DONUT_OTHER_KEY } from "@/features/analytics/constants/counterpartyDonutColors";
import { useDeferredHeavyCharts } from "@/features/analytics/hooks/useDeferredHeavyCharts";
import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import {
  isPastMonth,
  parseServerToday,
} from "@/features/analytics/utils/buildCashflowWindow";
import {
  topPayeeKeysFromRows,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { buildInsightsMonthSummary } from "@/features/analytics/utils/buildInsightsMonthSummary";
import type { CompareMonthParam } from "@/features/analytics/utils/compareMonths";
import { isInsightsMonthEmpty } from "@/features/analytics/utils/insightsEmptyState";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { useRecurringMonthQuery } from "@/features/recurring/hooks/useRecurringMonthQuery";
import type { TransactionRow } from "@/features/transactions/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useTourCommand } from "@/hooks/useTourCommand";
import { useTourRestorable } from "@/hooks/useTourRestorable";
import { emitTourEvent, tourEventNames } from "@/lib/tour/tourEvents";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import { toPaise } from "@/utils/paise";

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
  const recurringMonthQuery = useRecurringMonthQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const currentDay = useCurrentDay();

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
    () => topPayeeKeysFromRows(counterpartySpend),
    [counterpartySpend],
  );
  const topIncomeKeys = useMemo(
    () => topPayeeKeysFromRows(counterpartyIncome),
    [counterpartyIncome],
  );
  const topExpenses: TransactionRow[] = insightsData?.top_expenses ?? [];

  // The server's day decides whether the selected month is past; the recurring
  // month is "settled" once it loaded for THIS month (or failed).
  const serverToday = useMemo(
    () => parseServerToday(insightsData?.today),
    [insightsData?.today],
  );
  const recurringMonth = recurringMonthQuery.data;
  const recurringSettled =
    recurringMonthQuery.isError ||
    (recurringMonthQuery.isSuccess && !recurringMonthQuery.isPlaceholderData);
  const fixedMonth = recurringSettled ? recurringMonth : undefined;

  const expectedIncome =
    toPaise(fixedMonth?.totals.fixed_income_upcoming) / 100;
  const summary = useMemo((): InsightsMonthSummary | null => {
    if (summaryLoading || summaryFailed) return null;
    const isPast = isPastMonth(
      selectedMonth.year,
      selectedMonth.monthIndex0,
      serverToday,
    );
    return buildInsightsMonthSummary(
      insightsData?.summary,
      hasMonthlyBudget,
      monthlyBudgetAmount,
      isPast,
      { expectedIncome },
    );
  }, [
    expectedIncome,
    hasMonthlyBudget,
    insightsData?.summary,
    monthlyBudgetAmount,
    selectedMonth.year,
    selectedMonth.monthIndex0,
    serverToday,
    summaryFailed,
    summaryLoading,
  ]);

  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      navigation.navigate("TransactionDetail", { transaction });
      emitTourEvent(tourEventNames.transactionOpened);
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

  const openPayee = useCallback(
    (payeeKey: string, displayName: string) => {
      navigation.navigate("TransactionsList", {
        filter: "payee",
        year: selectedMonth.year,
        monthIndex0: selectedMonth.monthIndex0,
        payeeId: payeeKey,
        payeeDisplayName: displayName,
        payeeKeysTop: topPayeeKeys,
      });
      emitTourEvent(tourEventNames.payeeOpened);
    },
    [navigation, selectedMonth.monthIndex0, selectedMonth.year, topPayeeKeys],
  );
  const openTransactionsListForPayee = useCallback(
    (slice: CounterpartyDonutDatum) =>
      openPayee(slice.payee_key, slice.display_name),
    [openPayee],
  );
  // Credits only show under a payee filter when asked for, and "Other" needs the income donut's own top keys.
  const openTransactionsListForPayer = useCallback(
    (slice: CounterpartyDonutDatum) => {
      navigation.navigate("TransactionsList", {
        filter: "payee",
        year: selectedMonth.year,
        monthIndex0: selectedMonth.monthIndex0,
        payeeId: slice.payee_key,
        payeeDisplayName: slice.display_name,
        payeeKeysTop: topIncomeKeys,
        direction: "credit",
      });
    },
    [navigation, selectedMonth.monthIndex0, selectedMonth.year, topIncomeKeys],
  );

  // The tour may change the month; it puts it back when it ends.
  useTourRestorable("insights.month", {
    snapshot: () => selectedMonthIndex,
    restore: (index) => handleSelectMonth(index as number),
  });

  // "Open the top payee" on the Insights tour's payee step.
  useTourCommand("insightsOpenPayee", () => {
    const top = counterpartySpend.find((row) => row.payee_key !== COUNTERPARTY_DONUT_OTHER_KEY);
    if (top) {
      openPayee(top.payee_key, top.display_name);
    }
  });

  const openInsightsMonthCompare = useCallback(
    (monthA: CompareMonthParam, monthB: CompareMonthParam) => {
      navigation.navigate("InsightsMonthCompare", { monthA, monthB });
    },
    [navigation],
  );

  const { chartsReady } = useDeferredHeavyCharts(Boolean(insightsData));
  // A month with nothing logged shows one teaching card instead of empty charts.
  const monthEmpty = chartsDataSettled && isInsightsMonthEmpty(insightsData);

  return {
    monthEmpty,
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
    openTransactionsListForPayer,
    summary,
    summaryLoading,
    summaryFailed,
    hasMonthlyBudget,
    dailyCashflow,
    chartLoading,
    fixedCostsMonth: fixedMonth,
    fixedCostsLoading: !recurringSettled,
    currentDay,
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
