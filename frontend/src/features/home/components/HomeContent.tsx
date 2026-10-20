import { memo } from "react";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";
import { GetStartedCard } from "@/features/onboarding/components";

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
 * Layout: HeroMonthCard → Get started (until done) → MonthStatRow → Upcoming → Categories → Recent
 */
export const HomeContent = memo(function HomeContent(
  props: HomeBentoContentProps,
) {
  const styles = useStyles();
  const isLoading = props.isPending;

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

      <GetStartedCard
        onManualAdd={props.onManualAdd}
        onVoice={props.onVoice}
        onSetBudget={props.onAddMonthlyBudget}
        onAddRecurring={props.onAddRecurring}
        onAskAi={props.onAskAi}
      />

      <MonthStatRow
        incomeDisplay={props.creditedDisplay}
        incomeValue={props.incomeValue}
        spentDisplay={props.spentMonthDisplay}
        spentValue={props.spentMonthValue}
        netDisplay={props.netDisplay}
        netValue={props.netValue}
      />

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
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
}));
