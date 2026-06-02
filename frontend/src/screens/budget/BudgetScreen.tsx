import { FlashList } from "@shopify/flash-list";
import { LayoutGrid } from "lucide-react-native";
import { memo, useCallback, useMemo, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "@/components/categories/CategorySpendBentoRow";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { TwoToneEmptyState } from "@/components/shared";
import { colors, spacing } from "@/constants";
import {
  BUDGET_ROW_HEIGHT_SPENT_ONLY,
  BUDGET_ROW_HEIGHT_WITH_PROGRESS,
  BudgetCategoriesSectionHeader,
  BudgetCategoryRowsSkeleton,
  BudgetMonthBentoCard,
  BudgetMonthBentoSkeleton,
} from "@/features/budgets/components";

import {
  UNCATEGORIZED_SPEND_KEY,
  useBudgetScreenModel,
} from "./useBudgetScreenModel";

const CategoryListSeparator = memo(function CategoryListSeparator() {
  return <View style={styles.separator} />;
});

const BudgetListFooter = memo(function BudgetListFooter() {
  return <View style={styles.listFooter} />;
});

const BUDGET_LIST_DRAW_DISTANCE = Platform.select({
  ios: 280,
  android: 200,
  default: 240,
}) as number;

function isBudgetCategoryEditable(item: CategorySpendRowData): boolean {
  return (
    item.id !== UNCATEGORIZED_SPEND_KEY && item.name !== "Unknown category"
  );
}

export default function BudgetScreen() {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const {
    addCustomCategoryDisabled,
    budgetListKey,
    handleAddCustomCategory,
    handleEditBudget,
    handleEditCategory,
    handleSelectBudgetMonth,
    handleSetBudget,
    hasMonthlyBudget,
    isListLoading,
    listData,
    listExtraData,
    monthOptions,
    monthSummary,
    monthSummaryFailed,
    monthlyBudgetAmount,
    selectedMonth,
    showSummarySkeleton,
    summaryLoading,
  } = useBudgetScreenModel();

  const renderCategory = useCallback(
    ({ item }: { item: CategorySpendRowData }) => (
      <CategorySpendBentoRow
        item={item}
        hasMonthlyBudget={hasMonthlyBudget}
        monthlyBudgetAmount={monthlyBudgetAmount}
        onEditPress={
          isBudgetCategoryEditable(item)
            ? () => handleEditCategory(item.id)
            : undefined
        }
      />
    ),
    [handleEditCategory, hasMonthlyBudget, monthlyBudgetAmount],
  );

  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }, item: CategorySpendRowData) => {
      const hasCategoryCap = (item.monthlyCap ?? 0) > 0;
      const showProgress = hasCategoryCap || hasMonthlyBudget;
      layout.size = showProgress
        ? BUDGET_ROW_HEIGHT_WITH_PROGRESS
        : BUDGET_ROW_HEIGHT_SPENT_ONLY;
    },
    [hasMonthlyBudget],
  );

  const listEmpty = useMemo(() => {
    if (isListLoading) {
      return <BudgetCategoryRowsSkeleton />;
    }
    return (
      <TwoToneEmptyState
        layout="inline"
        icon={LayoutGrid}
        title="No categories yet"
        message="Sync categories to see budgets."
      />
    );
  }, [isListLoading]);

  const listFooter = useMemo(() => <BudgetListFooter />, []);

  const listSectionHeader = useMemo(
    () => (
      <BudgetCategoriesSectionHeader
        onAddPress={handleAddCustomCategory}
        addDisabled={addCustomCategoryDisabled}
      />
    ),
    [addCustomCategoryDisabled, handleAddCustomCategory],
  );

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        <View style={styles.summarySlot}>
          {showSummarySkeleton ? (
            <BudgetMonthBentoSkeleton />
          ) : (
            <BudgetMonthBentoCard
              selectedMonth={selectedMonth.label}
              monthOptions={monthOptions}
              onSelectMonth={handleSelectBudgetMonth}
              hasMonthlyBudget={hasMonthlyBudget}
              summary={monthSummary}
              summaryLoading={summaryLoading}
              summaryFailed={monthSummaryFailed}
              onEditBudget={handleEditBudget}
              onSetBudget={handleSetBudget}
              onMonthMenuOpenChange={setMonthMenuOpen}
            />
          )}
        </View>

        <FlashList
          key={budgetListKey}
          style={styles.list}
          scrollEnabled={!monthMenuOpen}
          data={listData}
          extraData={listExtraData}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
          overrideItemLayout={overrideItemLayout}
          drawDistance={BUDGET_LIST_DRAW_DISTANCE}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={CategoryListSeparator}
          ListEmptyComponent={listEmpty}
          ListHeaderComponent={listSectionHeader}
          ListFooterComponent={listFooter}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  summarySlot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  list: {
    flex: 1,
  },
  listFooter: {
    height: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
});
