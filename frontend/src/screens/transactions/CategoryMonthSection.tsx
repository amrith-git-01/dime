import { useIsFocused } from "@react-navigation/native";

import { CategoryMonthCard } from "@/features/transactions/components";
import { useCategoryMonthView } from "@/features/transactions/hooks/useCategoryMonthView";

import type { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";

type CategoryCardModel = NonNullable<
  ReturnType<typeof useTransactionsListScreenModel>["categoryCard"]
>;

/** The category list's month card: the screen model's month and rows in, the card's numbers out. */
export function CategoryMonthSection({ card }: { card: CategoryCardModel }) {
  // Last month's rows are paged in for the comparison only while the screen is in front.
  const focused = useIsFocused();
  const view = useCategoryMonthView({
    categoryId: card.categoryId,
    month: card.month,
    rows: card.rows,
    rowsHaveMore: card.rowsHaveMore,
    rowsStatus: card.rowsStatus,
    canSetCap: card.canEdit,
    active: focused,
    refreshToken: card.refreshToken,
  });

  return (
    <CategoryMonthCard
      categoryName={card.categoryName}
      barKey={`category-month-${card.categoryId}-${card.monthKey}`}
      monthLabel={card.monthLabel}
      prevMonthLabel={card.prevMonthLabel}
      nextMonthLabel={card.nextMonthLabel}
      canGoPrevMonth={card.canGoPrevMonth}
      canGoNextMonth={card.canGoNextMonth}
      onPrevMonth={card.onPrevMonth}
      onNextMonth={card.onNextMonth}
      view={view}
      onEdit={card.canEdit ? card.onEdit : undefined}
      onSetCap={card.canEdit ? card.onEdit : undefined}
    />
  );
}
