import { memo, type ReactNode } from "react";
import { Text, View } from "react-native";

import { TourTarget } from "@/components/shared";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import {
  ArrangeCards,
  OrderedCards,
  useCardOrder,
  type HomeCardId,
} from "@/features/cardLayout";
import { ReportBanner } from "@/features/brokeReport/components";
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
 * Default layout: HeroMonthCard → sync status (Pending chip / "Updated …", only when there is something to say,
 * and it travels with the hero) → Get started (until done) → MonthStatRow → Upcoming → Categories → Recent.
 * The cards are in the user's order (Arrange, at the end of the screen); the error line stays on top.
 */
export const HomeContent = memo(function HomeContent(
  props: HomeBentoContentProps,
) {
  const styles = useStyles();
  const cardOrder = useCardOrder("home");
  const isLoading = props.isPending;
  const { items: pendingItems } = usePendingTransactions();
  const hasSyncStatus = pendingItems.length > 0 || props.updatedLabel !== null;

  const cards: Partial<Record<HomeCardId, ReactNode>> = {
    "home.month": (
      <View>
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
              <Text
                style={styles.updatedLabel}
                accessibilityLiveRegion="polite"
              >
                {props.updatedLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    "home.getStarted": (
      <GetStartedCard
        onManualAdd={props.onManualAdd}
        onVoice={props.onVoice}
        onSetBudget={props.onAddMonthlyBudget}
        onAddRecurring={props.onAddRecurring}
        onAskAi={props.onAskAi}
      />
    ),
    "home.stats": (
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
    ),
    "home.upcoming": (
      <HomeUpcomingSection
        entries={props.upcomingEntries}
        today={props.upcomingToday}
        onItemPress={props.onUpcomingPress}
        onReminderPress={props.onReminderPress}
        onSeeAll={props.onSeeAllReminders}
        onAdd={props.onAddReminder}
      />
    ),
    "home.categories": (
      <HomeCategoriesSection
        items={props.topCategories}
        hasMonthlyBudget={props.hasMonthlyBudget}
        monthlyBudgetAmount={props.monthlyBudgetAmount}
        isLoading={isLoading}
        onViewAll={props.onNavigateBudgets}
        onCategoryPress={props.onCategoryPress}
      />
    ),
    "home.recent": (
      <HomeRecentSection
        transactions={props.recentTransactions}
        isEmpty={props.showRecentEmpty}
        isLoading={isLoading}
        onViewAll={props.onNavigateTransactions}
        onTransactionPress={props.onTransactionPress}
        onManualAdd={props.onManualAdd}
        onVoice={props.onVoice}
      />
    ),
  };

  return (
    <View style={styles.root}>
      {props.isError ? (
        <Text style={styles.error}>Could not load spending data.</Text>
      ) : null}

      {/* Not one of the arrangeable cards: it shows for a few days after a report lands. */}
      <ReportBanner />

      <OrderedCards
        order={cardOrder.order}
        cards={cards}
        ready={cardOrder.ready}
      />

      <TourTarget id={tourTargetIds.homeArrange} style={styles.arrangeTarget}>
        <ArrangeCards screen="home" cardOrder={cardOrder} />
      </TourTarget>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: SECTION_GAP,
  },
  // Hugs the centred Arrange button so the tour spotlights the button, not the full width.
  arrangeTarget: {
    alignSelf: "center",
  },
  syncStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    // Sits close under the hero card (the sync status travels with it when the cards are arranged).
    marginTop: spacing.md,
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
