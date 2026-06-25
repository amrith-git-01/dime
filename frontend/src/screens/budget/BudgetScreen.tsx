import { useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "@/components/categories/CategorySpendBentoRow";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import {
  CATEGORY_SPEND_ROW_DIVIDER_INSET,
  EmptyState,
  emptyStateCopy,
} from "@/components/shared";
import { line, paper, surface } from "@/constants/colors";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import {
  BudgetCategoriesSectionHeader,
  BudgetCategoryRowsSkeleton,
  BudgetSummaryCard,
} from "@/features/budgets/components";

import {
  UNCATEGORIZED_SPEND_KEY,
  useBudgetScreenModel,
} from "./useBudgetScreenModel";

function isBudgetCategoryEditable(item: CategorySpendRowData): boolean {
  return (
    item.id !== UNCATEGORIZED_SPEND_KEY && item.name !== "Unknown category"
  );
}

const SKELETON_ROW_COUNT = 10;

export default function BudgetScreen() {
  const {
    addCustomCategoryDisabled,
    budgetListKey,
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth,
    goNextMonth,
    handleAddCustomCategory,
    handleEditBudget,
    handleEditCategory,
    openCategoryTransactions,
    handleSetBudget,
    hasMonthlyBudget,
    isListLoading,
    listData,
    monthSummary,
    monthSummaryFailed,
    monthlyBudgetAmount,
    selectedMonth,
    summaryLoading,
  } = useBudgetScreenModel();

  const renderCategoryRow = useCallback(
    (item: CategorySpendRowData, index: number, isLast: boolean) => (
      <View key={item.id}>
        <CategorySpendBentoRow
          item={item}
          hasMonthlyBudget={hasMonthlyBudget}
          monthlyBudgetAmount={monthlyBudgetAmount}
          onPress={() => openCategoryTransactions(item)}
          onEditPress={
            isBudgetCategoryEditable(item)
              ? () => handleEditCategory(item.id)
              : undefined
          }
        />
        {!isLast && <View style={styles.rowDivider} />}
      </View>
    ),
    [
      handleEditCategory,
      hasMonthlyBudget,
      monthlyBudgetAmount,
      openCategoryTransactions,
    ],
  );

  const categoryCard = useMemo(() => {
    if (isListLoading) {
      return (
        <View style={styles.categoryCard}>
          <BudgetCategoryRowsSkeleton
            rowCount={SKELETON_ROW_COUNT}
            showProgress={hasMonthlyBudget}
          />
        </View>
      );
    }

    if (listData.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <EmptyState
            layout="inset"
            headline={emptyStateCopy.budgetCategories.headline}
            subtext={emptyStateCopy.budgetCategories.subtext}
          />
        </View>
      );
    }

    return (
      <View key={budgetListKey} style={styles.categoryCard}>
        {listData.map((item, index) =>
          renderCategoryRow(item, index, index === listData.length - 1),
        )}
      </View>
    );
  }, [
    isListLoading,
    hasMonthlyBudget,
    listData,
    budgetListKey,
    renderCategoryRow,
  ]);

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <BudgetSummaryCard
          selectedMonth={selectedMonth.label}
          canGoPrevMonth={canGoPrevMonth}
          canGoNextMonth={canGoNextMonth}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          hasMonthlyBudget={hasMonthlyBudget}
          summary={monthSummary}
          summaryLoading={summaryLoading}
          summaryFailed={monthSummaryFailed}
          onEditBudget={handleEditBudget}
          onSetBudget={handleSetBudget}
          spentValue={monthSummary?.spentValue ?? 0}
        />

        <View style={styles.sectionHeader}>
          <BudgetCategoriesSectionHeader
            onAddPress={handleAddCustomCategory}
            addDisabled={addCustomCategoryDisabled}
          />
        </View>

        {categoryCard}

        <View style={styles.footer} />
      </ScrollView>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: paper,
  },
  content: {
    paddingBottom: spacing.xl * 3,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  categoryCard: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginLeft: CATEGORY_SPEND_ROW_DIVIDER_INSET,
  },
  emptyCard: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  footer: {
    height: spacing.xl,
  },
});
