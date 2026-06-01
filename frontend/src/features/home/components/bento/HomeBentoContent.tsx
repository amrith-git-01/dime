import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, typography } from "@/constants";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { HomeBentoSkeleton } from "./HomeBentoSkeleton";
import { HomeCategoriesBento } from "./HomeCategoriesBento";
import { HomeIncomeExpenseTile } from "./HomeIncomeExpenseTile";
import { HomeRecentSection } from "./HomeRecentSection";
import { HomeSpendRow } from "./HomeSpendRow";
import type { HomeBentoContentProps } from "./types";

/**
 * Root composer for Home bento layout.
 * Shows skeleton during load; otherwise renders all four sections.
 * All navigation callbacks and data flow from HomeScreen — this component is display-only.
 */
export const HomeBentoContent = memo(function HomeBentoContent(
  props: HomeBentoContentProps,
) {
  if (props.isPending) {
    return <HomeBentoSkeleton />;
  }

  return (
    <View style={styles.root}>
      {props.isError ? (
        <Text style={styles.error}>Could not load spending overview.</Text>
      ) : null}

      {/* 1 — Spend row: today (narrow gradient) + month (wide sky + ring) */}
      <HomeSpendRow
        spentTodayDisplay={props.spentTodayDisplay}
        spentMonthDisplay={props.spentMonthDisplay}
        dayLabel={props.dayLabel}
        monthLabel={props.monthLabel}
        dailySubtext={props.dailySubtext}
        monthlySubtext={props.monthlySubtext}
        monthlyProgress={props.monthlyProgress}
        hasMonthlyBudget={props.hasMonthlyBudget}
        hasDailyBudget={props.hasDailyBudget}
        last7DaysSpend={props.last7DaysSpend}
        onAddMonthlyBudget={props.onAddMonthlyBudget}
        onAddDailyBudget={props.onAddDailyBudget}
      />

      {/* 2 — Cash flow: credited / debited / net */}
      <HomeIncomeExpenseTile
        creditedDisplay={props.creditedDisplay}
        debitedDisplay={props.debitedDisplay}
        netDisplay={props.netDisplay}
        netValue={props.netValue}
        isPending={props.incomePending}
        onPress={props.onNavigateTransactions}
      />

      {/* 3 — Top categories: Budget-style spend rows */}
      <HomeCategoriesBento
        items={props.topCategories}
        hasMonthlyBudget={props.hasMonthlyBudget}
        monthlyBudgetAmount={props.monthlyBudgetAmount}
        onViewAll={props.onNavigateBudgets}
        onManualAdd={props.onManualAdd}
        onReceipt={props.onReceipt}
        onVoice={props.onVoice}
      />

      {/* 4 — Recent: stacked mini-bento rows */}
      <HomeRecentSection
        transactions={props.recentTransactions}
        isEmpty={props.showRecentEmpty}
        onViewAll={props.onNavigateTransactions}
        onTransactionPress={props.onTransactionPress}
        onManualAdd={props.onManualAdd}
        onReceipt={props.onReceipt}
        onVoice={props.onVoice}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: BENTO_SECTION_GAP,
  },
  error: {
    fontFamily: typography.screenTitle.fontFamily,
    fontSize: 14,
    color: colors.danger,
    marginBottom: 4,
  },
});
