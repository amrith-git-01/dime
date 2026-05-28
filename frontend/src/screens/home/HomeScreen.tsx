import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { Camera, ChevronRight, Edit3, Mic } from "lucide-react-native";
import { memo, useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { MainStackParamList, MainTabParamList } from "@/navigation/types";

import { HeroSummaryCard } from "@/components/home/HeroSummaryCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { categoryMutedBackground } from "@/constants/colorUtils";
import { colors, layout, radius, spacing, typography } from "@/constants/theme";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { TransactionList } from "@/features/transactions/components/TransactionList";
import { TransactionListSkeleton } from "@/features/transactions/components/TransactionListSkeleton";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import { useTransactionsHomeQuery } from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionRow } from "@/features/transactions/types";
import { usePrefetchSiblingTabQueries } from "@/hooks/usePrefetchSiblingTabQueries";
import { useAddTransactionFabStore } from "@/stores/addTransactionFabStore";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";

import { HomeCategoryRail, type HomeCategoryUiItem } from "./HomeCategoryRail";

type HomeScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Home">,
  NativeStackNavigationProp<MainStackParamList>
>;

/** Hero / category rails: magnitude only, no leading minus. */
function formatInrSpendMagnitude(amount: string | number): string {
  const n = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n)) {
    return formatInrCompact(0);
  }
  return formatInrCompact(Math.abs(n));
}

type HomeQuickAddRowProps = {
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

const HomeQuickAddRow = memo(function HomeQuickAddRow({
  onManualAdd,
  onReceipt,
  onVoice,
}: HomeQuickAddRowProps) {
  return (
    <View style={styles.miniFabRow}>
      <Pressable
        accessibilityRole="button"
        onPress={onManualAdd}
        style={({ pressed }) => [
          styles.miniFab,
          pressed && styles.miniFabPressed,
        ]}
      >
        <Edit3 size={16} color={colors.textOnPrimary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onReceipt}
        style={({ pressed }) => [
          styles.miniFab,
          pressed && styles.miniFabPressed,
        ]}
      >
        <Camera size={16} color={colors.textOnPrimary} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onVoice}
        style={({ pressed }) => [
          styles.miniFab,
          pressed && styles.miniFabPressed,
        ]}
      >
        <Mic size={16} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  );
});

type HomeListHeaderProps = {
  isError: boolean;
  isPending: boolean;
  spentTodayDisplay: string;
  spentMonthDisplay: string;
  dayLabel: string;
  monthLabel: string;
  dailySubtext: string;
  monthlySubtext: string;
  dailyProgress: number;
  monthlyProgress: number;
  hasBudget: boolean;
  hasDailyBudget: boolean;
  hasMonthlyBudget: boolean;
  hasSpentToday: boolean;
  hasSpentMonth: boolean;
  topCategoriesUi: HomeCategoryUiItem[];
  showRecentEmpty: boolean;
  recentTransactions: TransactionRow[];
  onNavigateBudgets: () => void;
  onNavigateTransactions: () => void;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

const HomeListHeader = memo(function HomeListHeader({
  isError,
  isPending,
  spentTodayDisplay,
  spentMonthDisplay,
  dayLabel,
  monthLabel,
  dailySubtext,
  monthlySubtext,
  dailyProgress,
  monthlyProgress,
  hasBudget,
  hasDailyBudget,
  hasMonthlyBudget,
  hasSpentToday,
  hasSpentMonth,
  topCategoriesUi,
  showRecentEmpty,
  recentTransactions,
  onNavigateBudgets,
  onNavigateTransactions,
  onManualAdd,
  onReceipt,
  onVoice,
}: HomeListHeaderProps) {
  const showTopCategoriesEmpty = !isPending && topCategoriesUi.length === 0;

  return (
    <>
      {isError ? (
        <Text style={styles.errorText}>Could not load spending overview.</Text>
      ) : null}

      <HeroSummaryCard
        title="Spent Today"
        date={dayLabel}
        amount={spentTodayDisplay}
        subtext={dailySubtext}
        progress={dailyProgress}
        progressLabel={hasBudget ? "Daily budget used" : undefined}
        showProgress={hasDailyBudget && hasSpentToday}
        progressAnimationKey="home-hero-daily"
        actionLabel={!hasBudget ? "Add monthly budget" : undefined}
        onAction={!hasBudget ? onNavigateBudgets : null}
        isAmountLoading={isPending}
        amountSpinnerTone="white"
      />

      <HeroSummaryCard
        title="Spent Monthly"
        date={monthLabel}
        amount={spentMonthDisplay}
        subtext={monthlySubtext}
        progress={monthlyProgress}
        progressLabel={hasBudget ? "Monthly budget used" : undefined}
        showProgress={hasMonthlyBudget && hasSpentMonth}
        progressAnimationKey={`home-hero-monthly-${monthLabel}`}
        actionLabel={!hasBudget ? "Add monthly budget" : undefined}
        onAction={!hasBudget ? onNavigateBudgets : null}
        isAmountLoading={isPending}
        amountSpinnerTone="white"
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Top categories</Text>
        <Pressable
          onPress={onNavigateBudgets}
          style={({ pressed }) => [
            styles.viewAllButton,
            pressed && styles.viewAllButtonPressed,
          ]}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
        </Pressable>
      </View>

      {showTopCategoriesEmpty ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardText}>No transactions yet.</Text>
          <HomeQuickAddRow
            onManualAdd={onManualAdd}
            onReceipt={onReceipt}
            onVoice={onVoice}
          />
        </View>
      ) : (
        <HomeCategoryRail
          isPending={isPending}
          items={topCategoriesUi}
          showCategoryProgress={hasBudget}
        />
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <Pressable
          onPress={onNavigateTransactions}
          style={({ pressed }) => [
            styles.viewAllButton,
            pressed && styles.viewAllButtonPressed,
          ]}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ChevronRight size={16} color={colors.primary} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.recentCard}>
        {isPending ? (
          <TransactionListSkeleton count={5} variant="card" />
        ) : (
          <>
            {showRecentEmpty ? (
              <View style={styles.emptyCardInlineWrap}>
                <Text style={styles.emptyCardText}>No transactions yet.</Text>
                <HomeQuickAddRow
                  onManualAdd={onManualAdd}
                  onReceipt={onReceipt}
                  onVoice={onVoice}
                />
              </View>
            ) : null}
            <TransactionList items={recentTransactions} variant="card" />
          </>
        )}
      </View>
    </>
  );
});

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigation>();
  usePrefetchSiblingTabQueries();
  const { data: overview, isPending, isError } = useTransactionsHomeQuery();
  const openManualAdd = useCallback(() => {
    useAddTransactionFabStore.getState().closeForNavigation(() => {
      navigation.navigate("ManualAddTransaction");
    });
  }, [navigation]);
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);
  const openReceiptCamera = useReceiptCameraTransaction();

  const onNavigateBudgets = useCallback(() => {
    navigation.navigate("Budgets");
  }, [navigation]);

  const onNavigateTransactions = useCallback(() => {
    navigation.navigate("Transactions");
  }, [navigation]);

  const onReceipt = useCallback(() => {
    void openReceiptCamera();
  }, [openReceiptCamera]);

  const spentTodayDisplay = overview
    ? formatInrSpendMagnitude(overview.spent_today)
    : "—";
  const spentMonthDisplay = overview
    ? formatInrSpendMagnitude(overview.spent_this_month)
    : "—";

  const monthLabel = format(new Date(), "MMM yyyy");
  const dayLabel = format(new Date(), "d MMM");

  const topCategoriesUi = useMemo((): HomeCategoryUiItem[] => {
    if (!overview?.top_categories?.length) {
      return [];
    }
    const monthTotal = Number.parseFloat(overview.spent_this_month);
    const denom =
      Number.isFinite(monthTotal) && monthTotal > 0 ? monthTotal : 1;
    return overview.top_categories.slice(0, 5).map((row, index) => {
      const totalNum = Number.parseFloat(row.total);
      const progress = Number.isFinite(totalNum)
        ? Math.min(1, totalNum / denom)
        : 0;
      const color = row.color ?? colors.categoryDefault;
      const muted = categoryMutedBackground(row.color);
      return {
        id: row.category_id ?? `uncategorized-${index}`,
        label: row.name,
        icon_name: row.icon_name ?? "Package",
        amount: formatInrSpendMagnitude(row.total),
        progress,
        color,
        muted,
      };
    });
  }, [overview]);

  const { data: budgetResp } = useBudgetQuery();
  const budget = budgetResp?.budget ?? null;
  const hasBudget = Boolean(budget);
  const dailyBudget = budget ? Number.parseFloat(budget.daily_budget) : NaN;
  const monthlyBudget = budget ? Number.parseFloat(budget.monthly_budget) : NaN;
  const spentTodayNum = overview
    ? Math.abs(Number.parseFloat(overview.spent_today))
    : NaN;
  const spentMonthNum = overview
    ? Math.abs(Number.parseFloat(overview.spent_this_month))
    : NaN;
  const hasDailyBudget = Number.isFinite(dailyBudget) && dailyBudget > 0;
  const hasMonthlyBudget = Number.isFinite(monthlyBudget) && monthlyBudget > 0;
  const hasSpentToday = Number.isFinite(spentTodayNum);
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const dailyLeft =
    hasDailyBudget && hasSpentToday
      ? Math.max(0, dailyBudget - spentTodayNum)
      : NaN;
  const monthlyLeft =
    hasMonthlyBudget && hasSpentMonth
      ? Math.max(0, monthlyBudget - spentMonthNum)
      : NaN;
  const dailyProgress =
    hasDailyBudget && hasSpentToday
      ? Math.min(1, spentTodayNum / dailyBudget)
      : 0;
  const monthlyProgress =
    hasMonthlyBudget && hasSpentMonth
      ? Math.min(1, spentMonthNum / monthlyBudget)
      : 0;
  const dailySubtext =
    hasDailyBudget && hasSpentToday
      ? `${formatInrCompact(dailyLeft)} left from ${formatInrCompact(dailyBudget)}`
      : "";
  const monthlySubtext =
    hasMonthlyBudget && hasSpentMonth
      ? `${formatInrCompact(monthlyLeft)} left from ${formatInrCompact(monthlyBudget)}`
      : "";

  const recentTransactions = overview?.recent_transactions ?? [];
  const showRecentEmpty =
    !isPending && recentTransactions.length === 0 && !isError;

  const listHeaderProps = useMemo(
    (): HomeListHeaderProps => ({
      isError,
      isPending,
      spentTodayDisplay,
      spentMonthDisplay,
      dayLabel,
      monthLabel,
      dailySubtext,
      monthlySubtext,
      dailyProgress,
      monthlyProgress,
      hasBudget,
      hasDailyBudget,
      hasMonthlyBudget,
      hasSpentToday,
      hasSpentMonth,
      topCategoriesUi,
      showRecentEmpty,
      recentTransactions,
      onNavigateBudgets,
      onNavigateTransactions,
      onManualAdd: openManualAdd,
      onReceipt,
      onVoice: openVoiceCapture,
    }),
    [
      isError,
      isPending,
      spentTodayDisplay,
      spentMonthDisplay,
      dayLabel,
      monthLabel,
      dailySubtext,
      monthlySubtext,
      dailyProgress,
      monthlyProgress,
      hasBudget,
      hasDailyBudget,
      hasMonthlyBudget,
      hasSpentToday,
      hasSpentMonth,
      topCategoriesUi,
      showRecentEmpty,
      recentTransactions,
      onNavigateBudgets,
      onNavigateTransactions,
      openManualAdd,
      onReceipt,
      openVoiceCapture,
    ],
  );

  return (
    <TabScreenShell>
      {/*
       * ScrollView instead of a 1-item FlashList anchor (audit 2.5).
       * FlashList v2 removed estimatedItemSize; a dummy row still triggered an extra
       * layout pass on mount. Recent transactions are a small static list in the header.
       */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <HomeListHeader {...listHeaderProps} />
      </ScrollView>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: layout.screenContent,
  errorText: {
    fontFamily: typography.screenTitle.fontFamily,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: typography.sectionTitle,
  miniFabRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  miniFab: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.headerGradientStart,
  },
  miniFabPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.92,
  },
  recentCard: layout.card,
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllButtonPressed: {
    opacity: 0.7,
  },
  viewAllText: typography.linkSmall,
  emptyCard: {
    ...layout.card,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  emptyCardInlineWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  emptyCardText: {
    ...typography.emptyBody,
    marginBottom: spacing.sm,
  },
});
