import { format } from "date-fns";
import { useCallback, useEffect, useMemo } from "react";

import { useCategories } from "@/features/categories/hooks/useCategories";
import { usePendingTransactions } from "@/features/outbox/hooks/usePendingTransactions";
import {
  addPendingToMonthTotals,
  pendingInMonth,
  pendingTotals,
} from "@/features/outbox/utils/pendingMerge";
import {
  useMonthSummaryQuery,
  useTransactionsMonthInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import { buildAmountDomain } from "@/features/transactions/utils/amountRange";
import { flattenTransactionListSections } from "@/features/transactions/utils/buildTransactionFlashListData";
import {
  applyListCriteria,
  buildListSections,
  buildPayeeOptions,
  computeListTotals,
  countActiveFilters,
  criteriaNeedAllRows,
  DEFAULT_LIST_CRITERIA,
  formatListTotalsLine,
  monthListKindOfType,
  withCategoryScopes,
  type ListCriteria,
  type MonthListKind,
  type MonthRef,
} from "@/features/transactions/utils/monthListFilter";
import type { CategoryScope } from "@/features/transactions/types";
import { signedAmountPaise } from "@/features/transactions/utils/transactionDisplay";
import { paiseToRupees, toPaise } from "@/utils/paise";

/** Keep fetching until at least this many rows survive the filters. */
const MIN_LOADED_ROWS = 20;

/**
 * The Transactions tab's list view: the selected month's rows (drained through the month query,
 * plus entries still waiting to sync), filtered and sorted in memory, grouped by day with net totals.
 * The month is the calendar's (the tab owns it and the stepper moves it); the filters live in the
 * tab too, so they survive switching between Calendar and List and revisiting the tab.
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
  // Every payee in the month (not only those left after the other filters), for the Payee picker.
  const payeeOptions = useMemo(() => buildPayeeOptions(displayRows), [displayRows]);
  // The Amount slider's scale: the month's expenses (whatever the other filters leave), widened
  // to hold any amount bound already set.
  const { amountMinPaise, amountMaxPaise } = criteria;
  const amountDomain = useMemo(
    () => buildAmountDomain(displayRows, { amountMinPaise, amountMaxPaise }),
    [amountMaxPaise, amountMinPaise, displayRows],
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

  const activeFilterCount = countActiveFilters(criteria);
  // Empty-state copy: the type's own when it is the only filter, else the generic one.
  const emptyKind: MonthListKind | "filtered" =
    activeFilterCount === 1 && criteria.type !== "all" && criteria.type !== "expense"
      ? monthListKindOfType(criteria.type)
      : activeFilterCount > 0
        ? "filtered"
        : "all";
  const clearFilters = useCallback(
    () => onCriteriaChange(DEFAULT_LIST_CRITERIA),
    [onCriteriaChange],
  );

  // The unfiltered month reads its totals off the month summary (exact while the list is still
  // paging); a filtered one adds up the rows, which are all loaded by then.
  const summaryQuery = useMonthSummaryQuery(month.year, month.monthIndex0);
  const totalsLine = useMemo(() => {
    const summary = summaryQuery.data;
    if (!needsAllRows && summary) {
      const totals = addPendingToMonthTotals(summary, pendingTotals(monthPending));
      return formatListTotalsLine({
        count: totals.transaction_count,
        spentPaise: Math.abs(toPaise(totals.debit_total)),
        receivedPaise: Math.abs(toPaise(totals.credit_total)),
      });
    }
    return formatListTotalsLine(computeListTotals(filteredRows), hasMore);
  }, [filteredRows, hasMore, monthPending, needsAllRows, summaryQuery.data]);

  return {
    activeFilterCount,
    amountDomain,
    clearFilters,
    emptyKind,
    payeeOptions,
    totalsLine,
    monthLabel: format(new Date(month.year, month.monthIndex0, 1), "MMMM yyyy"),
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth: onPrevMonth,
    goNextMonth: onNextMonth,
    listItems,
    transactionCount,
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
