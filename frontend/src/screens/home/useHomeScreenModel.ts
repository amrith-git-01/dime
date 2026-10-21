import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { useCallback, useEffect, useMemo } from "react";

import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { categoryDefault } from "@/constants";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { useUpcomingRecurring } from "@/features/recurring/hooks/useUpcomingRecurring";
import type { RecurringItem } from "@/features/recurring/types";
import type { HomeBentoContentProps } from "@/features/home/components";
import { HOME_MAX_CATEGORIES } from "@/features/home/components";
import { computeMonthlyBudgetMath } from "@/features/home/utils/monthlyBudgetMath";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import {
  useMonthSummaryQuery,
  useTransactionsHomeQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type {
  HomeOverview,
  TransactionRow,
} from "@/features/transactions/types";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useTourCommand } from "@/hooks/useTourCommand";
import { emitTourEvent, tourEventNames } from "@/lib/tour/tourEvents";
import { usePreloadSiblingTabScreens } from "@/hooks/usePreloadSiblingTabScreens";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import { useAgentChatUiStore } from "@/stores/agentChatUiStore";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";
import { toPaise } from "@/utils/paise";

type HomeScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Home">,
  NativeStackNavigationProp<MainStackParamList>
>;

function buildLast7DaysSpend(
  rows: HomeOverview["last_7_days_spend"] | undefined,
  today: Date,
): { date: string; total: number }[] {
  const todayStr = format(today, "yyyy-MM-dd");

  // Only trust server rows when the window is complete AND ends on today.
  // Stale MMKV data (e.g. fetched Sunday) has rows ending on the previous day,
  // causing the chart to highlight the wrong "active" bar on the next day.
  if (rows?.length === 7 && rows[rows.length - 1]?.date === todayStr) {
    return rows.map((row) => {
      const n = Number.parseFloat(row.total);
      return { date: row.date, total: Number.isFinite(n) ? Math.abs(n) : 0 };
    });
  }

  // Data is missing or stale — generate a today-anchored skeleton with zeros.
  // React Query will refetch fresh data in the background; the chart will
  // update once the response arrives.
  return Array.from({ length: 7 }, (_, index) => ({
    date: format(subDays(today, 6 - index), "yyyy-MM-dd"),
    total: 0,
  }));
}

export function useHomeScreenModel(): HomeBentoContentProps {
  const navigation = useNavigation<HomeScreenNavigation>();
  usePreloadSiblingTabScreens();
  const { onManualAdd, onReceipt, onVoice } =
    useTransactionQuickAddActions(navigation);

  const now = useCurrentDay();
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const { data: overview, isPending, isError } = useTransactionsHomeQuery();

  // If the MMKV-cached home data is from a prior calendar day (staleTime=24h
  // means React Query won't refetch on its own until 24h elapse), force an
  // immediate refetch. The query persister writes the fresh response back to
  // MMKV automatically, so the next launch serves today-anchored data.
  useEffect(() => {
    const rows = overview?.last_7_days_spend;
    if (!rows?.length) return;
    const todayStr = format(now, "yyyy-MM-dd");
    const lastDate = rows[rows.length - 1]?.date;
    if (lastDate !== todayStr) {
      void queryClient.refetchQueries({
        queryKey: transactionsQueryKeys.home(userId, getDeviceIanaTimezone()),
        type: "active",
      });
    }
  }, [now, overview?.last_7_days_spend, queryClient, userId]);
  const monthSummaryQuery = useMonthSummaryQuery(
    now.getFullYear(),
    now.getMonth(),
  );
  const { data: budgetResp } = useBudgetQuery();
  const { items: upcomingItems, today: upcomingToday } = useUpcomingRecurring();

  const budget = budgetResp?.budget ?? null;

  const {
    monthlyBudget,
    spentMonthNum,
    hasMonthlyBudget,
    hasSpentMonth,
    monthlyLeft,
    monthlyProgress,
  } = computeMonthlyBudgetMath(
    budget?.monthly_budget,
    overview?.spent_this_month,
  );
  const monthlySubtext =
    hasMonthlyBudget && hasSpentMonth
      ? `${formatInrCompact(monthlyLeft)} left of ${formatInrCompact(monthlyBudget)}`
      : "";

  const spentMonthDisplay = overview
    ? formatSpendMagnitude(overview.spent_this_month)
    : "\u2014";
  const monthLabel = format(now, "MMM yyyy");
  const fixedSpentPaise = toPaise(overview?.fixed_spent_this_month);
  const monthSplitLine =
    overview && fixedSpentPaise > 0
      ? `Recurring ${formatInrCompact(fixedSpentPaise / 100)} · Flexible ${formatInrCompact(toPaise(overview.flexible_spent_this_month) / 100)}`
      : null;

  const monthSummaryData = monthSummaryQuery.data;

  const creditedDisplay = monthSummaryData
    ? formatSpendMagnitude(monthSummaryData.credit_total)
    : "\u2014";
  const incomeValue = monthSummaryData
    ? Math.abs(Number.parseFloat(monthSummaryData.credit_total)) || 0
    : 0;
  const spentMonthValue = Number.isFinite(spentMonthNum) ? spentMonthNum : 0;
  const debitedDisplay = monthSummaryData
    ? formatSpendMagnitude(monthSummaryData.debit_total)
    : "\u2014";
  const netDisplay = monthSummaryData
    ? formatNetDisplay(monthSummaryData.net)
    : "\u2014";
  const netValue = monthSummaryData
    ? (() => {
        const net = Number.parseFloat(monthSummaryData.net);
        return Number.isFinite(net) ? net : 0;
      })()
    : 0;

  const topCategories = useMemo((): CategorySpendRowData[] => {
    if (!overview?.top_categories?.length) return [];
    return overview.top_categories.slice(0, HOME_MAX_CATEGORIES).map((row) => {
      const spent = Number.parseFloat(row.total);
      return {
        id: row.category_id ?? UNCATEGORIZED_CATEGORY_KEY,
        name: row.name,
        icon_name: row.icon_name ?? "Package",
        color: row.color ?? categoryDefault,
        spentMonth: Number.isFinite(spent) ? Math.abs(spent) : 0,
        is_system: true,
      };
    });
  }, [overview]);

  const monthlyBudgetAmount = hasMonthlyBudget ? monthlyBudget : 0;

  const monthlyRemainingDisplay =
    hasMonthlyBudget && Number.isFinite(monthlyLeft)
      ? formatSpendMagnitude(monthlyLeft)
      : spentMonthDisplay;

  const last7DaysSpend = useMemo(
    () => buildLast7DaysSpend(overview?.last_7_days_spend, now),
    [now, overview?.last_7_days_spend],
  );

  const recentTransactions = overview?.recent_transactions ?? [];
  const showRecentEmpty =
    !isPending && recentTransactions.length === 0 && !isError;

  const onNavigateBudgets = useCallback(() => {
    navigation.navigate("Budgets");
  }, [navigation]);
  const onAddMonthlyBudget = useCallback(() => {
    navigation.navigate("EditMonthlyBudget", { mode: "create" });
  }, [navigation]);
  const onNavigateTransactions = useCallback(() => {
    navigation.navigate("Transactions");
  }, [navigation]);

  const onAddRecurring = useCallback(() => {
    navigation.navigate("Budgets", { recurringKind: "subscription" });
  }, [navigation]);
  const openAgentChat = useAgentChatUiStore((s) => s.open);

  const onUpcomingPress = useCallback(
    (item: RecurringItem) => {
      navigation.navigate("Budgets", { recurringKind: item.kind });
    },
    [navigation],
  );

  const onTransactionPress = useCallback(
    (tx: TransactionRow) => {
      navigation.navigate("TransactionDetail", { transaction: tx });
      emitTourEvent(tourEventNames.transactionOpened);
    },
    [navigation],
  );

  // "Open it for me" on the Home tour's step that asks the user to open a payment.
  useTourCommand("homeOpenTransaction", () => {
    const first = recentTransactions[0];
    if (first) {
      onTransactionPress(first);
    }
  });

  const onCategoryPress = useCallback(
    (item: CategorySpendRowData) => {
      navigation.navigate("TransactionsList", {
        filter: "category",
        year: now.getFullYear(),
        monthIndex0: now.getMonth(),
        categoryId: item.id,
        categoryDisplayName: item.name,
      });
    },
    [navigation, now],
  );

  return {
    creditedDisplay,
    incomeValue,
    debitedDisplay,
    hasMonthlyBudget,
    incomePending: monthSummaryQuery.isPending,
    isError,
    isPending,
    last7DaysSpend,
    monthLabel,
    monthSplitLine,
    monthlyBudgetAmount,
    monthlyProgress,
    monthlyRemainingDisplay,
    monthlySubtext,
    netDisplay,
    netValue,
    onAddMonthlyBudget,
    onAddRecurring,
    onAskAi: openAgentChat,
    onCategoryPress,
    onManualAdd,
    onNavigateBudgets,
    onNavigateTransactions,
    onReceipt,
    onTransactionPress,
    onVoice,
    recentTransactions,
    showRecentEmpty,
    spentMonthDisplay,
    spentMonthValue,
    topCategories,
    upcomingItems,
    upcomingToday,
    onUpcomingPress,
  };
}
