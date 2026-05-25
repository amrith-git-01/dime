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
import { transactionsQueryKeys } from "../queryKeys";
import type { TransactionRow } from "../types";

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
    placeholderData: keepPreviousData,
  });
}

function sumDebitByCategoryId(rows: TransactionRow[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const tx of rows) {
    if (tx.type !== "debit") {
      continue;
    }
    const n = Number.parseFloat(tx.amount);
    const add = Number.isFinite(n) ? Math.abs(n) : 0;
    const key = tx.category_id ?? "__uncategorized__";
    totals[key] = (totals[key] ?? 0) + add;
  }
  return totals;
}

async function fetchMonthDebitTotalsByCategory(input: {
  year: number;
  monthIndex0: number;
}): Promise<Record<string, number>> {
  const { from, to } = monthRangeIso(input.year, input.monthIndex0);
  const merged: Record<string, number> = {};
  let offset = 0;
  for (;;) {
    const page = await fetchTransactionsPage({
      from,
      to,
      limit: TX_PAGE_LIMIT,
      offset,
    });
    const chunk = sumDebitByCategoryId(page.items);
    for (const [categoryId, amount] of Object.entries(chunk)) {
      merged[categoryId] = (merged[categoryId] ?? 0) + amount;
    }
    if (!page.has_more) {
      break;
    }
    offset += page.items.length;
  }
  return merged;
}

/** Debit spend in the chosen calendar month, keyed by category id (or `__uncategorized__`). */
export function useMonthDebitTotalsByCategoryQuery(
  year: number,
  monthIndex0: number,
) {
  const { userId, authReady } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;

  return useQuery({
    queryKey: transactionsQueryKeys.monthCategoryDebits(
      userId,
      year,
      calendarMonth,
      timezone,
    ),
    queryFn: () => fetchMonthDebitTotalsByCategory({ year, monthIndex0 }),
    enabled: authReady && Boolean(userId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
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
