import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, typography } from "@/constants";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { HomeCategoriesBento } from "./HomeCategoriesBento";
import { HomeIncomeExpenseTile } from "./HomeIncomeExpenseTile";
import { HomeRecentSection } from "./HomeRecentSection";
import { HomeSpendRow } from "./HomeSpendRow";
import type { HomeBentoContentProps } from "./types";

/**
 * Root composer for Home bento layout.
 * Each section skeletonizes only its data while labels and chrome stay mounted.
 */
export const HomeBentoContent = memo(function HomeBentoContent(
  props: HomeBentoContentProps,
) {
  const overviewLoading = props.isPending;

  return (
    <View style={styles.root}>
      {props.isError ? (
        <Text style={styles.error}>Could not load spending overview.</Text>
      ) : null}

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
        isLoading={overviewLoading}
      />

      <HomeIncomeExpenseTile
        creditedDisplay={props.creditedDisplay}
        debitedDisplay={props.debitedDisplay}
        netDisplay={props.netDisplay}
        netValue={props.netValue}
        isPending={props.incomePending}
        onPress={props.onNavigateTransactions}
      />

      <HomeCategoriesBento
        items={props.topCategories}
        hasMonthlyBudget={props.hasMonthlyBudget}
        monthlyBudgetAmount={props.monthlyBudgetAmount}
        isLoading={overviewLoading}
        onViewAll={props.onNavigateBudgets}
        onCategoryPress={props.onCategoryPress}
        onManualAdd={props.onManualAdd}
        onReceipt={props.onReceipt}
        onVoice={props.onVoice}
      />

      <HomeRecentSection
        transactions={props.recentTransactions}
        isEmpty={props.showRecentEmpty}
        isLoading={overviewLoading}
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
