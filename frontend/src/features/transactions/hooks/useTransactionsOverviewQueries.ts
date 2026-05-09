import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  fetchHomeOverview,
  fetchMonthSummary,
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
} from "../api/transactionsApi";
import { transactionsQueryKeys } from "../queryKeys";

export function useTransactionsHomeQuery() {
  const { userId, authReady } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();

  return useQuery({
    queryKey: transactionsQueryKeys.home(userId, timezone),
    queryFn: () => fetchHomeOverview(timezone),
    enabled: authReady && Boolean(userId),
    staleTime: 60_000,
  });
}

export function useMonthSummaryQuery(year: number, monthIndex0: number) {
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
    queryFn: () =>
      fetchMonthSummary({
        year,
        month: calendarMonth,
        timezone,
      }),
    enabled: authReady && Boolean(userId),
    staleTime: 60_000,
  });
}

export function useTransactionsMonthInfiniteQuery(
  year: number,
  monthIndex0: number,
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
      if (!lastPage.has_more) {
        return undefined;
      }
      return lastOffset + lastPage.items.length;
    },
    enabled: authReady && Boolean(userId),
    staleTime: 60_000,
  });
}
