import { memo } from "react";
import { Text, View } from "react-native";

import { TourTarget } from "@/components/shared";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { GetStartedCard } from "@/features/onboarding/components";
import { PendingChip } from "@/features/outbox/components/PendingChip";
import { usePendingTransactions } from "@/features/outbox/hooks/usePendingTransactions";

import { HeroMonthCard } from "./HeroMonthCard";
import { HomeCategoriesSection } from "./HomeCategoriesSection";
import { HomeRecentSection } from "./HomeRecentSection";
import { HomeUpcomingSection } from "./HomeUpcomingSection";
import { MonthStatRow } from "./MonthStatRow";
import type { HomeBentoContentProps } from "./bento/types";
import { createThemedStyles } from "@/theme";

const SECTION_GAP = spacing.xl;

/**
 * Root composer for the Home screen.
 * Layout: HeroMonthCard → sync status (Pending chip / "Updated …", only when there is something to say)
 * → Get started (until done) → MonthStatRow → Upcoming → Categories → Recent
 */
export const HomeContent = memo(function HomeContent(
  props: HomeBentoContentProps,
) {
  const styles = useStyles();
  const isLoading = props.isPending;
  const { items: pendingItems } = usePendingTransactions();
  const hasSyncStatus = pendingItems.length > 0 || props.updatedLabel !== null;

  return (
    <View style={styles.root}>
      {props.isError ? (
        <Text style={styles.error}>Could not load spending data.</Text>
      ) : null}

      <HeroMonthCard
        monthLabel={props.monthLabel}
        heroAmount={props.spentMonthDisplay}
        hasBudget={props.hasMonthlyBudget}
        subtext={props.monthlySubtext}
        progress={props.monthlyProgress}
        splitLine={props.monthSplitLine}
        isLoading={isLoading}
        onAddBudget={props.onAddMonthlyBudget}
      />

      {hasSyncStatus ? (
        <View style={styles.syncStatus}>
          <PendingChip />
          {props.updatedLabel ? (
            <Text style={styles.updatedLabel} accessibilityLiveRegion="polite">
              {props.updatedLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      <GetStartedCard
        onManualAdd={props.onManualAdd}
        onVoice={props.onVoice}
        onSetBudget={props.onAddMonthlyBudget}
        onAddRecurring={props.onAddRecurring}
        onAskAi={props.onAskAi}
      />

      <TourTarget id={tourTargetIds.homeStats}>
        <MonthStatRow
          incomeDisplay={props.creditedDisplay}
          incomeValue={props.incomeValue}
          spentDisplay={props.spentMonthDisplay}
          spentValue={props.spentMonthValue}
          netDisplay={props.netDisplay}
          netValue={props.netValue}
        />
      </TourTarget>

      <HomeUpcomingSection
        items={props.upcomingItems}
        today={props.upcomingToday}
        onItemPress={props.onUpcomingPress}
      />

      <HomeCategoriesSection
        items={props.topCategories}
        hasMonthlyBudget={props.hasMonthlyBudget}
        monthlyBudgetAmount={props.monthlyBudgetAmount}
        isLoading={isLoading}
        onViewAll={props.onNavigateBudgets}
        onCategoryPress={props.onCategoryPress}
      />

      <HomeRecentSection
        transactions={props.recentTransactions}
        isEmpty={props.showRecentEmpty}
        isLoading={isLoading}
        onViewAll={props.onNavigateTransactions}
        onTransactionPress={props.onTransactionPress}
        onManualAdd={props.onManualAdd}
        onVoice={props.onVoice}
      />
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: SECTION_GAP,
  },
  syncStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    // Sits close under the hero card instead of a full section gap away.
    marginTop: -spacing.md,
  },
  updatedLabel: {
    flexShrink: 1,
    marginLeft: "auto",
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
}));
