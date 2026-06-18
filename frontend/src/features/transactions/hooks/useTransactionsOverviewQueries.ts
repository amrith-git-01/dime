import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  fetchHomeOverview,
  fetchMonthSummary,
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
} from "../api/transactionsApi";
import { monthSummaryDebitByCategory } from "../monthSummaryDebitByCategory";
import { transactionsQueryKeys } from "../queryKeys";

export function useTransactionsHomeQuery(options?: { enabled?: boolean }) {
  const { userId, authReady } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();

  return useQuery({
    queryKey: transactionsQueryKeys.home(userId, timezone),
    queryFn: () => fetchHomeOverview(timezone),
    enabled: (options?.enabled ?? true) && authReady && Boolean(userId),
    placeholderData: keepPreviousData,
  });
}

export function useMonthSummaryQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId, authReady } = useSessionUserId();
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
    enabled: (options?.enabled ?? true) && authReady && Boolean(userId),
    placeholderData: keepPreviousData,
  });
}

/** Debit spend in the chosen calendar month, keyed by category id (or `__uncategorized__`). */
export function useMonthDebitTotalsByCategoryQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId, authReady } = useSessionUserId();
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
    enabled: (options?.enabled ?? true) && authReady && Boolean(userId),
    placeholderData: keepPreviousData,
  });
}

export function useTransactionsMonthInfiniteQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId, authReady } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;
  const { from, to } = monthRangeIso(year, monthIndex0);

  return useInfiniteQuery({
    queryKey: transactionsQueryKeys.monthPages(
      userId,
      year,
      calendarMonth,
      timezone,
    ),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({
        from,
        to,
        limit: TX_PAGE_LIMIT,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (!lastPage.has_more) return undefined;
      return lastOffset + lastPage.items.length;
    },
    enabled: (options?.enabled ?? true) && authReady && Boolean(userId),
  });
}

export function useTransactionsRangeInfiniteQuery(
  fromIso: string,
  toIso: string,
  options?: { enabled?: boolean },
) {
  const { userId, authReady } = useSessionUserId();

  return useInfiniteQuery({
    queryKey: transactionsQueryKeys.rangePages(userId, fromIso, toIso),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({
        from: fromIso,
        to: toIso,
        limit: TX_PAGE_LIMIT,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (!lastPage.has_more) return undefined;
      return lastOffset + lastPage.items.length;
    },
    enabled: (options?.enabled ?? true) && authReady && Boolean(userId),
  });
}
