import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { danger } from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/spacing";

import { DailyCapStrip } from "./DailyCapStrip";
import { HeroMonthCard } from "./HeroMonthCard";
import { HomeCategoriesSection } from "./HomeCategoriesSection";
import { HomeRecentSection } from "./HomeRecentSection";
import { MonthStatRow } from "./MonthStatRow";
import type { HomeBentoContentProps } from "./bento/types";

const SECTION_GAP = spacing.xl;

/**
 * Root composer for the Home screen.
 * Layout: HeroMonthCard → DailyCapStrip → MonthStatRow → Categories → Recent
 */
export const HomeContent = memo(function HomeContent(
  props: HomeBentoContentProps,
) {
  const isLoading = props.isPending;

  return (
    <View style={styles.root}>
      {props.isError ? (
        <Text style={styles.error}>Could not load spending data.</Text>
      ) : null}

      <HeroMonthCard
        monthLabel={props.monthLabel}
        heroAmount={
          props.hasMonthlyBudget
            ? props.monthlyRemainingDisplay
            : props.spentMonthDisplay
        }
        hasBudget={props.hasMonthlyBudget}
        subtext={props.monthlySubtext}
        progress={props.monthlyProgress}
        isLoading={isLoading}
        onAddBudget={props.onAddMonthlyBudget}
      />

      <DailyCapStrip
        spentDisplay={props.spentTodayDisplay}
        subtext={props.dailySubtext}
        hasBudget={props.hasDailyBudget}
        progress={props.dailyProgress}
        onAddBudget={props.onAddDailyBudget}
      />

      <MonthStatRow
        incomeDisplay={props.creditedDisplay}
        incomeValue={props.incomeValue}
        spentDisplay={props.spentMonthDisplay}
        spentValue={props.spentMonthValue}
        netDisplay={props.netDisplay}
        netValue={props.netValue}
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
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: SECTION_GAP,
  },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: danger,
  },
});
