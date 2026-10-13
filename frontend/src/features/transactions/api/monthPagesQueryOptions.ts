import { infiniteQueryOptions } from "@tanstack/react-query";

import { TRANSACTIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";

import { transactionsQueryKeys } from "../queryKeys";
import {
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
  type TransactionListFilters,
} from "./transactionsApi";

/** Server filters make a month list its own cache entry (and one realtime patches must skip). */
export function hasListFilters(
  filters: TransactionListFilters | undefined,
): boolean {
  return Boolean(filters?.payee || filters?.categoryId);
}

/**
 * Single definition of the month transaction list query (key + fetcher). The screen hook and the
 * bootstrap prefetch both use it: they share a cache entry, so the prefetch must send the same
 * params (notably `timezone`, which is what makes the server return `day_summaries`).
 */
export function transactionsMonthPagesQueryOptions(input: {
  userId: string | undefined;
  year: number;
  monthIndex0: number;
  timezone: string;
  filters?: TransactionListFilters;
}) {
  const { userId, year, monthIndex0, timezone, filters } = input;
  const calendarMonth = monthIndex0 + 1;
  const { from, to } = monthRangeIso(year, monthIndex0);

  return infiniteQueryOptions({
    queryKey: hasListFilters(filters)
      ? transactionsQueryKeys.filteredMonthPages(
          userId,
          year,
          calendarMonth,
          timezone,
          filters ?? {},
        )
      : transactionsQueryKeys.monthPages(userId, year, calendarMonth, timezone),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({
        from,
        to,
        limit: TX_PAGE_LIMIT,
        offset: pageParam,
        timezone,
        filters,
      }),
    initialPageParam: 0,
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (!lastPage.has_more) return undefined;
      return lastOffset + lastPage.items.length;
    },
  });
}
