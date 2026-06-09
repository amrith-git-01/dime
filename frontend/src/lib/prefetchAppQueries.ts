import type { QueryClient } from "@tanstack/react-query";

import { fetchMonthInsights } from "@/features/analytics/api/fetchMonthInsights";
import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { fetchBudget } from "@/features/budgets/api/budgetsApi";
import { fetchCategoryBudgets } from "@/features/budgets/api/categoryBudgetsApi";
import { budgetQueryKey } from "@/features/budgets/hooks/useBudget";
import { categoryBudgetsQueryKey } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { fetchCategories } from "@/features/categories/api/categoriesApi";
import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import {
  fetchHomeOverview,
  fetchMonthSummary,
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
} from "@/features/transactions/api/transactionsApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

const PREFETCH_STALE_MS = 15 * 60 * 1000;

/** Pre-warm tab queries after MMKV hydrate — only fetches when stale or missing. */
export function prefetchAppQueries(
  queryClient: QueryClient,
  userId: string,
): void {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthIndex0 = now.getMonth();
  const timezone = getDeviceIanaTimezone();
  const { from, to } = monthRangeIso(year, monthIndex0);

  void queryClient.prefetchQuery({
    queryKey: transactionsQueryKeys.home(userId, timezone),
    queryFn: () => fetchHomeOverview(timezone),
    staleTime: PREFETCH_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: insightsQueryKeys.month(userId, year, month, timezone),
    queryFn: () => fetchMonthInsights({ year, month, timezone }),
    staleTime: PREFETCH_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: categoriesQueryKeys.list(),
    queryFn: fetchCategories,
    staleTime: PREFETCH_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: budgetQueryKey,
    queryFn: fetchBudget,
    staleTime: PREFETCH_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: categoryBudgetsQueryKey,
    queryFn: fetchCategoryBudgets,
    staleTime: PREFETCH_STALE_MS,
  });

  void queryClient.prefetchQuery({
    queryKey: transactionsQueryKeys.monthSummary(
      userId,
      year,
      month,
      timezone,
    ),
    queryFn: () => fetchMonthSummary({ year, month, timezone }),
    staleTime: PREFETCH_STALE_MS,
  });

  void queryClient.prefetchInfiniteQuery({
    queryKey: transactionsQueryKeys.monthPages(userId, year, month, timezone),
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({
        from,
        to,
        limit: TX_PAGE_LIMIT,
        offset: pageParam as number,
      }),
    initialPageParam: 0,
    staleTime: PREFETCH_STALE_MS,
  });
}
