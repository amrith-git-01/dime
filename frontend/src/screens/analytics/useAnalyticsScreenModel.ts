import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { useBentoMonthSelection } from "@/components/bento";
import type { InsightsMonthSummary } from "@/features/analytics/components";
import type { InsightsCashflowDaySelection } from "@/features/analytics/components/InsightsDailyCashflowChart";
import { useMonthInsightsQuery } from "@/features/analytics/hooks/useMonthInsightsQuery";
import {
  topPayeeKeysFromSpend,
  type CounterpartyDonutDatum,
} from "@/features/analytics/utils/buildCounterpartyDonutData";
import { computeBurnRateMetrics } from "@/features/analytics/utils/computeBurnRateMetrics";
import {
  buildEmptyBurnRateMetrics,
  buildEmptyInsightsMonthSummary,
} from "@/features/analytics/utils/insightsEmptyState";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import type { TransactionRow } from "@/features/transactions/types";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

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

  const insightsLoading = insightsQuery.isPending;
  const summaryLoading =
    insightsLoading || (isBudgetLoading && budgetResp === undefined);
  const summaryFailed = insightsQuery.isError;
  const chartLoading = insightsLoading;

  const dailyCashflow = useMemo(
    () => insightsQuery.data?.daily_cashflow ?? [],
    [insightsQuery.data?.daily_cashflow],
  );
  const counterpartySpend = useMemo(
    () => insightsQuery.data?.counterparty_spend ?? [],
    [insightsQuery.data?.counterparty_spend],
  );
  const topPayeeKeys = useMemo(
    () => topPayeeKeysFromSpend(counterpartySpend),
    [counterpartySpend],
  );
  const topExpenses = insightsQuery.data?.top_expenses ?? [];

  const summary = useMemo((): InsightsMonthSummary | null => {
    if (summaryLoading || summaryFailed) {
      return null;
    }
    const data = insightsQuery.data?.summary;
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
  }, [
    hasMonthlyBudget,
    insightsQuery.data?.summary,
    monthlyBudgetAmount,
    summaryFailed,
    summaryLoading,
  ]);

  const burnRateMetrics = useMemo(() => {
    if (chartLoading) {
      return null;
    }
    if (summaryFailed) {
      return buildEmptyBurnRateMetrics(
        hasMonthlyBudget,
        hasMonthlyBudget ? monthlyBudgetAmount : null,
      );
    }
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
        payeeKey: slice.payee_key,
        payeeKeysTop: topPayeeKeys,
        payeeDisplayName: slice.display_name,
      });
    },
    [navigation, selectedMonth.monthIndex0, selectedMonth.year, topPayeeKeys],
  );

  return {
    monthOptions,
    selectedMonth,
    handleSelectMonth,
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
    topExpenses,
    onManualAdd,
    onReceipt,
    onVoice,
  };
}
