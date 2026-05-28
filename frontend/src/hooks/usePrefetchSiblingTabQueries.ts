import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchBudget } from "@/features/budgets/api/budgetsApi";
import { budgetQueryKey } from "@/features/budgets/hooks/useBudget";
import {
  fetchMonthSummary,
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
} from "@/features/transactions/api/transactionsApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

const PREFETCH_STALE_MS = 60_000;

/**
 * Warms Transactions + Budget tab caches while Home is focused (audit 3.3).
 */
export function usePrefetchSiblingTabQueries() {
  const queryClient = useQueryClient();
  const { userId, authReady } = useSessionUserId();

  useFocusEffect(
    useCallback(() => {
      if (!authReady || !userId) {
        return;
      }

      const timezone = getDeviceIanaTimezone();
      const now = new Date();
      const year = now.getFullYear();
      const monthIndex0 = now.getMonth();
      const calendarMonth = monthIndex0 + 1;
      const { from, to } = monthRangeIso(year, monthIndex0);

      void queryClient.prefetchInfiniteQuery({
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
        pages: 1,
        staleTime: PREFETCH_STALE_MS,
      });

      void queryClient.prefetchQuery({
        queryKey: transactionsQueryKeys.monthSummary(
          userId,
          year,
          calendarMonth,
          timezone,
        ),
        queryFn: () =>
          fetchMonthSummary({ year, month: calendarMonth, timezone }),
        staleTime: PREFETCH_STALE_MS,
      });

      void queryClient.prefetchQuery({
        queryKey: budgetQueryKey,
        queryFn: fetchBudget,
        staleTime: PREFETCH_STALE_MS,
      });
    }, [authReady, queryClient, userId]),
  );
}
