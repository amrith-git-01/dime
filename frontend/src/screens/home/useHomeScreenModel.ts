import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format, subDays } from "date-fns";
import { useCallback, useMemo } from "react";

import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { colors } from "@/constants";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import type { HomeBentoContentProps } from "@/features/home/components";
import { HOME_MAX_CATEGORIES } from "@/features/home/components";
import {
  useMonthSummaryQuery,
  useTransactionsHomeQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type {
  HomeOverview,
  TransactionRow,
} from "@/features/transactions/types";
import { usePrefetchSiblingTabQueries } from "@/hooks/usePrefetchSiblingTabQueries";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

type HomeScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Home">,
  NativeStackNavigationProp<MainStackParamList>
>;

function buildLast7DaysSpend(
  rows: HomeOverview["last_7_days_spend"] | undefined,
): { date: string; total: number }[] {
  if (rows?.length === 7) {
    return rows.map((row) => {
      const n = Number.parseFloat(row.total);
      return {
        date: row.date,
        total: Number.isFinite(n) ? Math.abs(n) : 0,
      };
    });
  }

  return Array.from({ length: 7 }, (_, index) => {
    const day = subDays(new Date(), 6 - index);
    return { date: format(day, "yyyy-MM-dd"), total: 0 };
  });
}

export function useHomeScreenModel(): HomeBentoContentProps {
  const navigation = useNavigation<HomeScreenNavigation>();
  usePrefetchSiblingTabQueries();
  const { onManualAdd, onReceipt, onVoice } =
    useTransactionQuickAddActions(navigation);

  const { data: overview, isPending, isError } = useTransactionsHomeQuery();
  const now = useMemo(() => new Date(), []);
  const monthSummaryQuery = useMonthSummaryQuery(
    now.getFullYear(),
    now.getMonth(),
  );
  const { data: budgetResp } = useBudgetQuery();
  const budget = budgetResp?.budget ?? null;

  const monthlyBudget = budget ? Number.parseFloat(budget.monthly_budget) : NaN;
  const spentMonthNum = overview
    ? Math.abs(Number.parseFloat(overview.spent_this_month))
    : NaN;
  const hasMonthlyBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0;
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const monthlyLeft =
    hasMonthlyBudget && hasSpentMonth
      ? Math.max(0, monthlyBudget - spentMonthNum)
      : NaN;
  const monthlyProgress =
    hasMonthlyBudget && hasSpentMonth
      ? Math.min(1, spentMonthNum / monthlyBudget)
      : 0;
  const monthlySubtext =
    hasMonthlyBudget && hasSpentMonth
      ? `${formatInrCompact(monthlyLeft)} / ${formatInrCompact(monthlyBudget)}`
      : "";

  const dailyBudget = budget ? Number.parseFloat(budget.daily_budget) : NaN;
  const spentTodayNum = overview
    ? Math.abs(Number.parseFloat(overview.spent_today))
    : NaN;
  const hasDailyBudget = Number.isFinite(dailyBudget) && dailyBudget > 0;
  const hasSpentToday = Number.isFinite(spentTodayNum);
  const dailyLeft =
    hasDailyBudget && hasSpentToday
      ? Math.max(0, dailyBudget - spentTodayNum)
      : NaN;
  const dailySubtext =
    hasDailyBudget && hasSpentToday
      ? `${formatInrCompact(dailyLeft)} / ${formatInrCompact(dailyBudget)}`
      : "";

  const spentTodayDisplay = overview
    ? formatSpendMagnitude(overview.spent_today)
    : "\u2014";
  const spentMonthDisplay = overview
    ? formatSpendMagnitude(overview.spent_this_month)
    : "\u2014";
  const dayLabel = format(now, "d MMM");
  const monthLabel = format(now, "MMM yyyy");

  const creditedDisplay = monthSummaryQuery.data
    ? formatSpendMagnitude(monthSummaryQuery.data.credit_total)
    : "\u2014";
  const debitedDisplay = monthSummaryQuery.data
    ? formatSpendMagnitude(monthSummaryQuery.data.debit_total)
    : "\u2014";
  const netDisplay = monthSummaryQuery.data
    ? formatNetDisplay(monthSummaryQuery.data.net)
    : "\u2014";
  const netValue = monthSummaryQuery.data
    ? (() => {
        const net = Number.parseFloat(monthSummaryQuery.data.net);
        return Number.isFinite(net) ? net : 0;
      })()
    : 0;

  const topCategories = useMemo((): CategorySpendRowData[] => {
    if (!overview?.top_categories?.length) {
      return [];
    }
    return overview.top_categories
      .slice(0, HOME_MAX_CATEGORIES)
      .map((row, index) => {
        const spent = Number.parseFloat(row.total);
        return {
          id: row.category_id ?? `uncategorized-${index}`,
          name: row.name,
          icon_name: row.icon_name ?? "Package",
          color: row.color ?? colors.categoryDefault,
          spentMonth: Number.isFinite(spent) ? Math.abs(spent) : 0,
          is_system: true,
        };
      });
  }, [overview]);

  const monthlyBudgetAmount = hasMonthlyBudget ? monthlyBudget : 0;

  const last7DaysSpend = useMemo(
    () => buildLast7DaysSpend(overview?.last_7_days_spend),
    [overview?.last_7_days_spend],
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

  const onAddDailyBudget = useCallback(() => {
    navigation.navigate("EditMonthlyBudget", { mode: "create" });
  }, [navigation]);

  const onNavigateTransactions = useCallback(() => {
    navigation.navigate("Transactions");
  }, [navigation]);

  const onTransactionPress = useCallback(
    (tx: TransactionRow) => {
      navigation.navigate("TransactionDetail", { transaction: tx });
    },
    [navigation],
  );

  return {
    creditedDisplay,
    dailySubtext,
    dayLabel,
    debitedDisplay,
    hasDailyBudget,
    hasMonthlyBudget,
    incomePending: monthSummaryQuery.isPending,
    isError,
    isPending,
    last7DaysSpend,
    monthLabel,
    monthlyProgress,
    monthlySubtext,
    netDisplay,
    netValue,
    onAddDailyBudget,
    onAddMonthlyBudget,
    onManualAdd,
    onNavigateBudgets,
    onNavigateTransactions,
    onReceipt,
    onTransactionPress,
    onVoice,
    recentTransactions,
    monthlyBudgetAmount,
    showRecentEmpty,
    spentMonthDisplay,
    spentTodayDisplay,
    topCategories,
  };
}
