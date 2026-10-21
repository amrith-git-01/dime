import {
  FlashList,
  type FlashListRef,
  type ListRenderItem,
} from "@shopify/flash-list";
import { useRef } from "react";
import { View } from "react-native";

import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import {
  CARD_SEGMENT_SHADOW_TOP_BLEED,
  EmptyState,
  emptyStateCopy,
  TourTarget,
} from "@/components/shared";
import { FLOATING_BUTTONS_CLEARANCE } from "@/constants";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import {
  BudgetCategoriesSectionHeader,
  BudgetCategoryRow,
  BudgetCategoryRowsSkeleton,
  BudgetSummaryCard,
} from "@/features/budgets/components";
import { RecurringSection } from "@/features/recurring/components";
import { useTourCommand } from "@/hooks/useTourCommand";
import { useTourScroller } from "@/hooks/useTourScroller";

import { useBudgetRecurringModel } from "./useBudgetRecurringModel";
import {
  UNCATEGORIZED_SPEND_KEY,
  useBudgetScreenModel,
} from "./useBudgetScreenModel";
import { createThemedStyles } from "@/theme";

function isBudgetCategoryEditable(item: CategorySpendRowData): boolean {
  return (
    item.budgetEditable !== false &&
    item.id !== UNCATEGORIZED_SPEND_KEY &&
    item.name !== "Unknown category"
  );
}

const SKELETON_ROW_COUNT = 10;
const NO_ROWS: CategorySpendRowData[] = [];

export default function BudgetScreen() {
  const styles = useStyles();
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
    suggestedBudget,
    summaryLoading,
  } = useBudgetScreenModel();
  const listRef = useRef<FlashListRef<CategorySpendRowData>>(null);
  const recurring = useBudgetRecurringModel(listRef);
  // Lets the guided tour scroll the list so each spotlighted part is in view.
  const { onScroll } = useTourScroller("budgets", (y, animated) =>
    listRef.current?.scrollToOffset({ offset: y, animated }),
  );
  // "Open one for me" on the Budgets tour's steps: the first recurring item, the first category.
  useTourCommand("budgetsOpenRecurring", () => {
    const first = recurring.income.items[0] ?? recurring.subscriptions.items[0];
    if (first) {
      recurring.onItemPress(first);
    }
  });
  useTourCommand("budgetsOpenCategory", () => {
    const first = listData[0];
    if (first) {
      openCategoryTransactions(first);
    }
  });

  // Keys carry the month so rows remount (and progress bars snap) when the month changes.
  const keyExtractor = (item: CategorySpendRowData) =>
    `${budgetListKey}:${item.id}`;

  const renderItem: ListRenderItem<CategorySpendRowData> = ({ item, index }) => (
    <BudgetCategoryRow
      item={item}
      isFirst={index === 0}
      isLast={index === listData.length - 1}
      editable={isBudgetCategoryEditable(item)}
      hasMonthlyBudget={hasMonthlyBudget}
      monthlyBudgetAmount={monthlyBudgetAmount}
      onOpen={openCategoryTransactions}
      onEdit={handleEditCategory}
      tourTargetId={index === 0 ? tourTargetIds.budgetsFirstCategory : undefined}
    />
  );

  return (
    <TabScreenShell>
      <FlashList
        ref={listRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={styles.list}
        data={isListLoading ? NO_ROWS : listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={{ hasMonthlyBudget, monthlyBudgetAmount }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <TourTarget id={tourTargetIds.budgetsSummary}>
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
                suggestedBudget={suggestedBudget}
              />
            </TourTarget>

            <TourTarget
              id={tourTargetIds.budgetsRecurring}
              onLayout={recurring.onSectionLayout}
            >
              <RecurringSection
                income={recurring.income}
                subscriptions={recurring.subscriptions}
                today={recurring.today}
                onAdd={recurring.onAdd}
                onItemPress={recurring.onItemPress}
              />
            </TourTarget>

            <TourTarget
              id={tourTargetIds.budgetsCategoriesHeader}
              style={styles.sectionHeader}
            >
              <BudgetCategoriesSectionHeader
                onAddPress={handleAddCustomCategory}
                addDisabled={addCustomCategoryDisabled}
              />
            </TourTarget>
          </View>
        }
        ListEmptyComponent={
          isListLoading ? (
            <View style={styles.categoryCard}>
              <BudgetCategoryRowsSkeleton
                rowCount={SKELETON_ROW_COUNT}
                showProgress={hasMonthlyBudget}
              />
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <EmptyState
                layout="inset"
                headline={emptyStateCopy.budgetCategories.headline}
                subtext={emptyStateCopy.budgetCategories.subtext}
              />
            </View>
          )
        }
      />
    </TabScreenShell>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  list: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    paddingBottom: FLOATING_BUTTONS_CLEARANCE,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    // The first category segment reserves top room for its card shadow.
    marginBottom: -CARD_SEGMENT_SHADOW_TOP_BLEED,
  },
  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    overflow: "hidden",
    ...shadows.card,
  },
}));
