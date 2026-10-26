import { useRef, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import {
  CARD_SEGMENT_SHADOW_TOP_BLEED,
  EmptyState,
  emptyStateCopy,
  TourTarget,
} from "@/components/shared";
import { ARRANGE_SCREEN_BOTTOM_CLEARANCE } from "@/constants";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { tourTargetIds } from "@/constants/tourTargetIds";
import {
  ArrangeCards,
  OrderedCards,
  useCardOrder,
  type BudgetsCardId,
} from "@/features/cardLayout";
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
  const cardOrder = useCardOrder("budgets");
  const scrollRef = useRef<ScrollView>(null);
  const recurring = useBudgetRecurringModel(scrollRef);
  // Lets the guided tour scroll the screen so each spotlighted part is in view.
  const { onScroll } = useTourScroller("budgets", (y, animated) =>
    scrollRef.current?.scrollTo({ y, animated }),
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

  const categoryRows = isListLoading ? null : listData.length === 0 ? (
    <View style={styles.emptyCard}>
      <EmptyState
        layout="inset"
        headline={emptyStateCopy.budgetCategories.headline}
        subtext={emptyStateCopy.budgetCategories.subtext}
      />
    </View>
  ) : (
    // Keys carry the month so rows remount (and progress bars snap) when the month changes.
    listData.map((item, index) => (
      <BudgetCategoryRow
        key={`${budgetListKey}:${item.id}`}
        item={item}
        isFirst={index === 0}
        isLast={index === listData.length - 1}
        editable={isBudgetCategoryEditable(item)}
        hasMonthlyBudget={hasMonthlyBudget}
        monthlyBudgetAmount={monthlyBudgetAmount}
        onOpen={openCategoryTransactions}
        onEdit={handleEditCategory}
        tourTargetId={
          index === 0 ? tourTargetIds.budgetsFirstCategory : undefined
        }
      />
    ))
  );

  const cards: Partial<Record<BudgetsCardId, ReactNode>> = {
    "budgets.summary": (
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
    ),
    "budgets.recurring": (
      <TourTarget id={tourTargetIds.budgetsRecurring}>
        <RecurringSection
          income={recurring.income}
          subscriptions={recurring.subscriptions}
          today={recurring.today}
          onAdd={recurring.onAdd}
          onItemPress={recurring.onItemPress}
        />
      </TourTarget>
    ),
    "budgets.categories": (
      <View>
        <TourTarget
          id={tourTargetIds.budgetsCategoriesHeader}
          style={styles.sectionHeader}
        >
          <BudgetCategoriesSectionHeader
            onAddPress={handleAddCustomCategory}
            addDisabled={addCustomCategoryDisabled}
          />
        </TourTarget>
        {isListLoading ? (
          <View style={styles.categoryCard}>
            <BudgetCategoryRowsSkeleton
              rowCount={SKELETON_ROW_COUNT}
              showProgress={hasMonthlyBudget}
            />
          </View>
        ) : (
          categoryRows
        )}
      </View>
    ),
  };

  return (
    <TabScreenShell>
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <OrderedCards
          order={cardOrder.order}
          cards={cards}
          ready={cardOrder.ready}
          onCardLayout={(id, event) => {
            // The recurring block's top, for "scroll to Recurring" (measured in the scroll content).
            if (id === "budgets.recurring") {
              recurring.onSectionLayout(event);
            }
          }}
        />

        <ArrangeCards screen="budgets" cardOrder={cardOrder} />
      </ScrollView>
    </TabScreenShell>
  );
}

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  list: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  // The blocks (summary, recurring, categories) have no top margin of their own: the gap spaces
  // them whatever order the user put them in.
  content: {
    paddingTop: spacing.lg,
    paddingBottom: ARRANGE_SCREEN_BOTTOM_CLEARANCE,
    gap: spacing.xl,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
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
