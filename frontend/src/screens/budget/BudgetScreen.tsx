import { memo, useCallback, useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "@/components/categories/CategorySpendBentoRow";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { EmptyState, emptyStateCopy } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { line, paper, surface } from "@/constants/colors";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import {
  BudgetCategoriesSectionHeader,
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

const CategoryRowSkeleton = memo(function CategoryRowSkeleton() {
  return (
    <View style={styles.skeletonRow}>
      <SkeletonBlock tone="surface" style={styles.skeletonIcon} />
      <View style={styles.skeletonMeta}>
        <SkeletonBlock tone="surface" style={styles.skeletonName} />
        <SkeletonBlock tone="surface" style={styles.skeletonSub} />
      </View>
      <SkeletonBlock tone="surface" style={styles.skeletonAmount} />
    </View>
  );
});

const SKELETON_COUNT = 5;

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
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <View key={i}>
              <CategoryRowSkeleton />
              {i < SKELETON_COUNT - 1 && <View style={styles.rowDivider} />}
            </View>
          ))}
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
  }, [isListLoading, listData, budgetListKey, renderCategoryRow]);

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
    height: 1,
    backgroundColor: line,
    marginLeft: spacing.lg + 46 + spacing.md,
  },
  emptyCard: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    overflow: "hidden",
    ...shadows.card,
  },
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  skeletonIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    flexShrink: 0,
  },
  skeletonMeta: {
    flex: 1,
    gap: spacing.xs,
  },
  skeletonName: {
    height: 14,
    width: "55%",
    borderRadius: 4,
  },
  skeletonSub: {
    height: 11,
    width: "35%",
    borderRadius: 4,
  },
  skeletonAmount: {
    width: 52,
    height: 14,
    borderRadius: 4,
  },
  footer: {
    height: spacing.xl,
  },
});
