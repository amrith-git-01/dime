import { format } from "date-fns";
import { useEffect, useMemo, useRef } from "react";

import { useCategoryBudgetsQuery } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { toPaise } from "@/utils/paise";

import type { TransactionListFilters } from "../api/transactionsApi";
import { UNCATEGORIZED_CATEGORY_KEY } from "../constants/uncategorizedCategoryKey";
import type { TransactionRow } from "../types";
import {
  buildCategoryMonthView,
  comparisonWindow,
  countCategoryDebits,
  monthClock,
  sumCategoryDebitsOnDay,
  sumCategoryDebitsUpToDay,
  type CategoryMonthView,
  type Loadable,
} from "../utils/categoryMonthStats";
import type { MonthRef } from "../utils/monthListFilter";

import {
  useMonthDebitTotalsByCategoryQuery,
  useTransactionsMonthInfiniteQuery,
} from "./useTransactionsOverviewQueries";

type RowsStatus = "loading" | "error" | "ready";

type QueryState = {
  isPending: boolean;
  isError: boolean;
  isPlaceholderData?: boolean;
  data: unknown;
};

/** `keepPreviousData` serves the last month while the next one loads; that counts as loading. */
function loadStatus(query: QueryState): RowsStatus {
  if (query.isPending || query.isPlaceholderData) return "loading";
  if (query.isError && query.data === undefined) return "error";
  return "ready";
}

/**
 * A month's rows for a category, paged in until complete (they are newest first and the card's
 * windows start at day 1, so it needs them all). Pages are fetched only while `enabled` and
 * `active` (the screen is focused) and only while the query reports more pages, so a complete
 * cached query is never fetched again. Cached complete data stays "ready" through a failed
 * background refetch: only a failed page fetch (or no data at all) is an error.
 */
function useDrainedMonthRows(
  month: MonthRef,
  filters: TransactionListFilters | undefined,
  enabled: boolean,
  active: boolean,
) {
  const query = useTransactionsMonthInfiniteQuery(month.year, month.monthIndex0, {
    enabled,
    filters,
  });
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = query;

  useEffect(() => {
    if (enabled && active && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [active, enabled, fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage]);

  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data],
  );
  let status = loadStatus(query);
  if (status === "ready" && hasNextPage) {
    status = isFetchNextPageError ? "error" : "loading";
  }
  return { rows, status, refetch };
}

export type CategoryMonthViewArgs = {
  categoryId: string;
  month: MonthRef;
  /** The selected month's debit rows of this category, as the list shows them. */
  rows: readonly TransactionRow[];
  /** More rows of the month are still to be loaded, so `rows` is a lower bound. */
  rowsHaveMore: boolean;
  rowsStatus: RowsStatus;
  /** Whether the category can have a cap set (it exists and is editable). */
  canSetCap: boolean;
  /** False while the screen is not focused: nothing is paged in the background then. Default true. */
  active?: boolean;
  /** Changes when the screen refreshes; the card's own queries are refetched with it. */
  refreshToken?: number;
};

/**
 * The category month card's numbers.
 * - The hero, the cap bar and "left" use the month summary: the full month's debits, future-dated
 *   ones included, because that money is already committed. It is exact even while the list pages.
 * - Today and Payments come from the list's loaded rows (debits only).
 * - "vs last month" compares like with like. The current month is compared over days 1..today on
 *   both sides, so its side comes from the month's rows (paged in fully, narrowed by the server's
 *   category filter, sharing the list's cache entry) and last month's rows up to the same day. A
 *   past month is compared in full from the two summaries.
 * - Uncategorized has no server filter, so its rows are never paged in for the comparison: it is
 *   compared only for past months, and the current month shows no comparison.
 * Entries still waiting to sync are not included, matching the list under the card.
 */
export function useCategoryMonthView({
  categoryId,
  month,
  rows,
  rowsHaveMore,
  rowsStatus,
  canSetCap,
  active = true,
  refreshToken = 0,
}: CategoryMonthViewArgs): CategoryMonthView {
  const isUncategorized = categoryId === UNCATEGORIZED_CATEGORY_KEY;
  const now = new Date();
  const todayKey = format(now, "yyyy-MM-dd");
  const clock = monthClock(month, now);
  const window = comparisonWindow(month, now);
  const previousMonth = window.previousMonth;
  // Rows-based comparison: the current month of a category the server can filter.
  const compareByRows = clock.isCurrent && !isUncategorized;

  const spendQuery = useMonthDebitTotalsByCategoryQuery(month.year, month.monthIndex0);
  const previousSummaryQuery = useMonthDebitTotalsByCategoryQuery(
    previousMonth.year,
    previousMonth.monthIndex0,
    { enabled: !clock.isCurrent },
  );

  // Same filter as the list.
  const rowFilters = useMemo(
    (): TransactionListFilters | undefined => (isUncategorized ? undefined : { categoryId }),
    [categoryId, isUncategorized],
  );
  const currentRows = useDrainedMonthRows(month, rowFilters, compareByRows, active);
  const previousRows = useDrainedMonthRows(previousMonth, rowFilters, compareByRows, active);

  const budgetsQuery = useCategoryBudgetsQuery();

  // A refresh of the screen refetches what the card reads on its own (the month's rows are the
  // list's own query, which the list refetches). Runs once per new token.
  const seenRefreshToken = useRef(refreshToken);
  const refetchSpend = spendQuery.refetch;
  const refetchBudgets = budgetsQuery.refetch;
  const refetchPreviousSummary = previousSummaryQuery.refetch;
  const refetchPreviousRows = previousRows.refetch;
  const isCurrentMonth = clock.isCurrent;
  useEffect(() => {
    if (seenRefreshToken.current === refreshToken) return;
    seenRefreshToken.current = refreshToken;
    void refetchSpend();
    void refetchBudgets();
    if (!isCurrentMonth) {
      void refetchPreviousSummary();
    } else if (compareByRows) {
      void refetchPreviousRows();
    }
  }, [
    compareByRows,
    isCurrentMonth,
    refetchBudgets,
    refetchPreviousRows,
    refetchPreviousSummary,
    refetchSpend,
    refreshToken,
  ]);

  const capSource = useMemo((): Loadable<number | null> => {
    if (isUncategorized) return { status: "ready", value: null };
    if (budgetsQuery.isPending) return { status: "loading" };
    if (budgetsQuery.isError && budgetsQuery.data === undefined) return { status: "error" };
    const row = budgetsQuery.data?.find((entry) => entry.category_id === categoryId);
    const paise = toPaise(row?.monthly_amount);
    return { status: "ready", value: paise > 0 ? paise : null };
  }, [budgetsQuery.data, budgetsQuery.isError, budgetsQuery.isPending, categoryId, isUncategorized]);

  const spendStatus = loadStatus(spendQuery);
  const previousSummaryStatus = loadStatus(previousSummaryQuery);

  const spentPaise: Loadable<number> =
    spendStatus === "ready"
      ? { status: "ready", value: toPaise(spendQuery.data?.[categoryId] ?? 0) }
      : { status: spendStatus };

  // Both sides of the comparison over the same days.
  let comparedPaise: Loadable<number>;
  let previousPaise: Loadable<number>;
  if (clock.isCurrent) {
    comparedPaise =
      currentRows.status === "ready"
        ? {
            status: "ready",
            value: sumCategoryDebitsUpToDay(
              currentRows.rows,
              categoryId,
              month,
              clock.dayOfMonth ?? 0,
            ),
          }
        : { status: currentRows.status };
    previousPaise =
      previousRows.status === "ready"
        ? {
            status: "ready",
            value: sumCategoryDebitsUpToDay(
              previousRows.rows,
              categoryId,
              previousMonth,
              window.cutoffDay,
            ),
          }
        : { status: previousRows.status };
  } else {
    comparedPaise = spentPaise;
    previousPaise =
      previousSummaryStatus === "ready"
        ? { status: "ready", value: toPaise(previousSummaryQuery.data?.[categoryId] ?? 0) }
        : { status: previousSummaryStatus };
  }

  const todayPaise: Loadable<number> =
    rowsStatus === "ready"
      ? { status: "ready", value: sumCategoryDebitsOnDay(rows, categoryId, todayKey) }
      : { status: rowsStatus };

  return buildCategoryMonthView({
    month,
    now,
    cap: capSource,
    canSetCap,
    spentPaise,
    todayPaise,
    payments:
      rowsStatus === "ready"
        ? {
            status: "ready",
            value: { count: countCategoryDebits(rows, categoryId), hasMore: rowsHaveMore },
          }
        : { status: rowsStatus },
    comparedPaise,
    previousPaise,
    comparable: !(clock.isCurrent && isUncategorized),
  });
}
