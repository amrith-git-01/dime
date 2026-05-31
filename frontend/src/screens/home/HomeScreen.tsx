import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format, subDays } from "date-fns";
import { memo, useCallback, useMemo } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { HomeBentoContent } from "@/components/home/bento/HomeBentoContent";
import { HOME_MAX_CATEGORIES } from "@/components/home/bento/homeBentoTokens";
import type { HomeCategoryBentoItem } from "@/components/home/bento/types";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, layout } from "@/constants/theme";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { formatInrCompact, formatNetDisplay, formatSpendMagnitude } from "@/features/transactions/formatAmount";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import {
  useMonthSummaryQuery,
  useTransactionsHomeQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type {
  HomeOverview,
  TransactionRow,
} from "@/features/transactions/types";
import { usePrefetchSiblingTabQueries } from "@/hooks/usePrefetchSiblingTabQueries";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

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

export default memo(function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigation>();
  usePrefetchSiblingTabQueries();

  // --- Quick-add actions ---
  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);

  // --- Data ---
  const { data: overview, isPending, isError } = useTransactionsHomeQuery();

  // Stable date snapshot — recalculated once on mount, not on every re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), []);
  const monthSummaryQuery = useMonthSummaryQuery(
    now.getFullYear(),
    now.getMonth(),
  );

  const { data: budgetResp } = useBudgetQuery();
  const budget = budgetResp?.budget ?? null;
  const hasBudget = Boolean(budget);

  // --- Budget math ---
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

  // Daily subtext (no ring — just context string)
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

  // --- Display strings ---
  const spentTodayDisplay = overview
    ? formatSpendMagnitude(overview.spent_today)
    : "—";
  const spentMonthDisplay = overview
    ? formatSpendMagnitude(overview.spent_this_month)
    : "—";
  const dayLabel = format(now, "d MMM");
  const monthLabel = format(now, "MMM yyyy");

  // --- Income vs expense (from month summary, already prefetched) ---
  const creditedDisplay = monthSummaryQuery.data
    ? formatSpendMagnitude(monthSummaryQuery.data.credit_total)
    : "—";
  const debitedDisplay = monthSummaryQuery.data
    ? formatSpendMagnitude(monthSummaryQuery.data.debit_total)
    : "—";
  const netDisplay = monthSummaryQuery.data
    ? formatNetDisplay(monthSummaryQuery.data.net)
    : "—";
  const netValue = monthSummaryQuery.data
    ? (() => {
        const net = Number.parseFloat(monthSummaryQuery.data.net);
        return Number.isFinite(net) ? net : 0;
      })()
    : 0;

  // --- Top categories (full color, no muted) ---
  const topCategories = useMemo((): HomeCategoryBentoItem[] => {
    if (!overview?.top_categories?.length) {
      return [];
    }
    const monthTotal = Number.parseFloat(overview.spent_this_month);
    const denom =
      Number.isFinite(monthTotal) && monthTotal > 0 ? monthTotal : 1;
    return overview.top_categories
      .slice(0, HOME_MAX_CATEGORIES)
      .map((row, index) => {
        const totalNum = Number.parseFloat(row.total);
        const progress = Number.isFinite(totalNum)
          ? Math.min(1, totalNum / denom)
          : 0;
        return {
          id: row.category_id ?? `uncategorized-${index}`,
          label: row.name,
          icon_name: row.icon_name ?? "Package",
          amount: formatSpendMagnitude(row.total),
          progress,
          color: row.color ?? colors.categoryDefault,
        };
      });
  }, [overview]);

  const last7DaysSpend = useMemo(
    () => buildLast7DaysSpend(overview?.last_7_days_spend),
    [overview?.last_7_days_spend],
  );

  // --- Recent ---
  const recentTransactions = overview?.recent_transactions ?? [];
  const showRecentEmpty =
    !isPending && recentTransactions.length === 0 && !isError;

  // --- Navigation ---
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

  const onManualAdd = useCallback(() => {
    navigation.navigate("ManualAddTransaction");
  }, [navigation]);

  const onReceipt = useCallback(() => {
    void captureReceiptAndCreate();
  }, [captureReceiptAndCreate]);

  const onVoice = useCallback(() => {
    openVoiceCapture();
  }, [openVoiceCapture]);

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HomeBentoContent
          isError={isError}
          isPending={isPending}
          spentTodayDisplay={spentTodayDisplay}
          spentMonthDisplay={spentMonthDisplay}
          dayLabel={dayLabel}
          monthLabel={monthLabel}
          dailySubtext={dailySubtext}
          monthlySubtext={monthlySubtext}
          monthlyProgress={monthlyProgress}
          hasMonthlyBudget={hasMonthlyBudget}
          hasDailyBudget={hasDailyBudget}
          last7DaysSpend={last7DaysSpend}
          creditedDisplay={creditedDisplay}
          debitedDisplay={debitedDisplay}
          netDisplay={netDisplay}
          netValue={netValue}
          incomePending={monthSummaryQuery.isPending}
          topCategories={topCategories}
          showCategoryProgress={hasBudget}
          recentTransactions={recentTransactions}
          showRecentEmpty={showRecentEmpty}
          onNavigateBudgets={onNavigateBudgets}
          onAddMonthlyBudget={onAddMonthlyBudget}
          onAddDailyBudget={onAddDailyBudget}
          onNavigateTransactions={onNavigateTransactions}
          onTransactionPress={onTransactionPress}
          onManualAdd={onManualAdd}
          onReceipt={onReceipt}
          onVoice={onVoice}
        />
      </ScrollView>
    </TabScreenShell>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: layout.screenContent,
});
