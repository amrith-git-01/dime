import { format } from "date-fns";
import { useCallback, useEffect, useMemo } from "react";

import { useCategories } from "@/features/categories/hooks/useCategories";
import { usePendingTransactions } from "@/features/outbox/hooks/usePendingTransactions";
import { pendingInMonth } from "@/features/outbox/utils/pendingMerge";
import { useTransactionsMonthInfiniteQuery } from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { flattenTransactionListSections } from "@/features/transactions/utils/buildTransactionFlashListData";
import {
  activeKindChip,
  applyKindChip,
  applyListCriteria,
  buildListSections,
  countActiveFilters,
  criteriaNeedAllRows,
  withCategoryScopes,
  type ListCriteria,
  type MonthListKind,
  type MonthRef,
} from "@/features/transactions/utils/monthListFilter";
import type { CategoryScope } from "@/features/transactions/types";
import { signedAmountPaise } from "@/features/transactions/utils/transactionDisplay";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { paiseToRupees } from "@/utils/paise";

/** Keep fetching until at least this many rows survive the filters. */
const MIN_LOADED_ROWS = 20;

/**
 * The Transactions tab's list view: the selected month's rows (drained through the month query,
 * plus entries still waiting to sync), filtered and sorted in memory, grouped by day with net totals.
 * The month is the calendar's (the tab owns it and the stepper moves it); the filters live in the
 * tab too, so they survive switching between Calendar and List.
 */
export type TransactionsMonthListArgs = {
  month: MonthRef;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  criteria: ListCriteria;
  onCriteriaChange: (criteria: ListCriteria) => void;
};

export function useTransactionsMonthListModel({
  month,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
  criteria,
  onCriteriaChange,
}: TransactionsMonthListArgs) {
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    isFetchNextPageError,
    isRefetching,
    refetch,
  } = useTransactionsMonthInfiniteQuery(month.year, month.monthIndex0);

  // Entries saved offline are merged in for display only, as the calendar does.
  const { pendingRows } = usePendingTransactions();
  const spendCategories = useCategories("spend").categories;
  const recurringExpenseCategories = useCategories("recurring_expense").categories;
  const recurringIncomeCategories = useCategories("recurring_income").categories;
  const scopeByCategoryId = useMemo(() => {
    const map = new Map<string, CategoryScope>();
    const add = (scope: CategoryScope, list: { id: string }[]) => {
      for (const category of list) map.set(category.id, scope);
    };
    add("spend", spendCategories);
    add("recurring_expense", recurringExpenseCategories);
    add("recurring_income", recurringIncomeCategories);
    return map;
  }, [recurringExpenseCategories, recurringIncomeCategories, spendCategories]);
  const monthPending = useMemo(
    () =>
      withCategoryScopes(
        pendingInMonth(pendingRows, month.year, month.monthIndex0),
        scopeByCategoryId,
      ),
    [month.monthIndex0, month.year, pendingRows, scopeByCategoryId],
  );

  const flatRows = useMemo(
    () => (infiniteData?.pages ?? []).flatMap((page) => page.items),
    [infiniteData],
  );
  const displayRows = useMemo(
    () => (monthPending.length > 0 ? [...monthPending, ...flatRows] : flatRows),
    [flatRows, monthPending],
  );
  const filteredRows = useMemo(
    () => applyListCriteria(displayRows, criteria),
    [criteria, displayRows],
  );
  const sections = useMemo(
    () => buildListSections(filteredRows, criteria.sort),
    [criteria.sort, filteredRows],
  );
  const listItems = useMemo(() => {
    const netTotals: Record<string, number> = {};
    for (const section of sections) {
      netTotals[section.key] = paiseToRupees(
        section.data.reduce((sum, tx) => sum + signedAmountPaise(tx), 0),
      );
    }
    return flattenTransactionListSections(sections, netTotals);
  }, [sections]);

  const transactionCount = filteredRows.length;
  const hasMore = Boolean(hasNextPage);

  // Filters and sorts run on loaded rows, so they drain the month; a plain newest-first month
  // only tops up a list too short to scroll and otherwise pages on scroll.
  const needsAllRows = criteriaNeedAllRows(criteria);
  const shouldAutoLoadPages =
    hasMore &&
    !isFetchingNextPage &&
    !isError &&
    (needsAllRows || transactionCount < MIN_LOADED_ROWS);
  useEffect(() => {
    if (shouldAutoLoadPages) {
      void fetchNextPage();
    }
  }, [fetchNextPage, shouldAutoLoadPages, flatRows.length]);

  const loadMore = useCallback(() => {
    if (hasMore && !isFetchingNextPage && !isError) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasMore, isError, isFetchingNextPage]);

  const retry = useCallback(() => {
    if (isFetchNextPageError) {
      void fetchNextPage();
    } else {
      void refetch();
    }
  }, [fetchNextPage, isFetchNextPageError, refetch]);

  /** Quick chips are shortcuts for the Type and Kind filters. */
  const selectKindChip = useCallback((kind: MonthListKind) => {
    void triggerHaptic();
    onCriteriaChange(applyKindChip(criteria, kind));
  }, [criteria, onCriteriaChange]);

  const kindChip = activeKindChip(criteria);
  // Empty-state copy: the chip's own, or the generic one once categories or a search narrow it.
  const emptyKind: MonthListKind | "filtered" =
    kindChip === null ||
    criteria.categoryIds.length > 0 ||
    criteria.search.trim().length > 0
      ? "filtered"
      : kindChip;

  return {
    activeFilterCount: countActiveFilters(criteria),
    kindChip,
    emptyKind,
    selectKindChip,
    monthLabel: format(new Date(month.year, month.monthIndex0, 1), "MMM yyyy"),
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth: onPrevMonth,
    goNextMonth: onNextMonth,
    listItems,
    transactionCount,
    transactionCountLabel: `${transactionCount}${hasMore ? "+" : ""}`,
    transactionCountIsPlural: transactionCount !== 1 || hasMore,
    showInitialLoading: isPending && flatRows.length === 0 && monthPending.length === 0,
    showLoadingMore: hasMore && isFetchingNextPage,
    isError,
    hasLoadedRows: displayRows.length > 0,
    isRetrying: isFetchingNextPage || isRefetching,
    isEmpty:
      !isPending &&
      !isError &&
      transactionCount === 0 &&
      !(hasMore && isFetchingNextPage),
    retry,
    loadMore,
  };
}
