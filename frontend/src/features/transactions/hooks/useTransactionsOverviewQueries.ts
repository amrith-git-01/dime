import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { keepPreviousDataForUser } from "@/lib/keepPreviousDataForUser";
import { TRANSACTIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { hasListFilters, transactionsMonthPagesQueryOptions } from "../api/monthPagesQueryOptions";
import {
  fetchHomeOverview,
  fetchMonthSummary,
  fetchTransactionsPage,
  TX_PAGE_LIMIT,
  type TransactionListFilters,
} from "../api/transactionsApi";
import { monthSummaryDebitByCategory } from "../monthSummaryDebitByCategory";
import { transactionsQueryKeys } from "../queryKeys";

export function useTransactionsHomeQuery(options?: { enabled?: boolean }) {
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();

  return useQuery({
    queryKey: transactionsQueryKeys.home(userId, timezone),
    queryFn: () => fetchHomeOverview(timezone),
    enabled: (options?.enabled ?? true) && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    placeholderData: keepPreviousDataForUser(userId),
  });
}

export function useMonthSummaryQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;

  return useQuery({
    queryKey: transactionsQueryKeys.monthSummary(
      userId,
      year,
      calendarMonth,
      timezone,
    ),
    queryFn: () => fetchMonthSummary({ year, month: calendarMonth, timezone }),
    enabled: (options?.enabled ?? true) && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    placeholderData: keepPreviousDataForUser(userId),
  });
}

/** Debit spend in the chosen calendar month, keyed by category id (or `__uncategorized__`). */
export function useMonthDebitTotalsByCategoryQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;

  return useQuery({
    queryKey: transactionsQueryKeys.monthSummary(
      userId,
      year,
      calendarMonth,
      timezone,
    ),
    queryFn: () => fetchMonthSummary({ year, month: calendarMonth, timezone }),
    select: monthSummaryDebitByCategory,
    enabled: (options?.enabled ?? true) && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    placeholderData: keepPreviousDataForUser(userId),
  });
}

export function useTransactionsMonthInfiniteQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean; filters?: TransactionListFilters },
) {
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();

  return useInfiniteQuery({
    ...transactionsMonthPagesQueryOptions({
      userId,
      year,
      monthIndex0,
      timezone,
      filters: options?.filters,
    }),
    enabled: (options?.enabled ?? true) && Boolean(userId),
  });
}

export function useTransactionsRangeInfiniteQuery(
  fromIso: string,
  toIso: string,
  options?: { enabled?: boolean; filters?: TransactionListFilters },
) {
  const { userId } = useSessionUserId();
  const filters = options?.filters;

  return useInfiniteQuery({
    queryKey: transactionsQueryKeys.rangePages(
      userId,
      fromIso,
      toIso,
      hasListFilters(filters) ? filters : undefined,
    ),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({
        from: fromIso,
        to: toIso,
        limit: TX_PAGE_LIMIT,
        offset: pageParam,
        filters,
      }),
    initialPageParam: 0,
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (!lastPage.has_more) return undefined;
      return lastOffset + lastPage.items.length;
    },
    enabled: (options?.enabled ?? true) && Boolean(userId),
  });
}
