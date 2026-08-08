import { hydrate } from "@tanstack/query-core";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

import { fetchMonthInsights } from "@/features/analytics/api/fetchMonthInsights";
import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { fetchBudget } from "@/features/budgets/api/budgetsApi";
import { fetchCategoryBudgets } from "@/features/budgets/api/categoryBudgetsApi";
import { budgetQueryKey } from "@/features/budgets/hooks/useBudget";
import { categoryBudgetsQueryKey } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { fetchCategories } from "@/features/categories/api/categoriesApi";
import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import { hydrateNotificationsFromMmkv } from "@/features/notifications/cache/syncNotificationsMmkv";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { fetchUserSettings } from "@/features/settings/api/settingsApi";
import { hydrateUserSettingsFromMmkv } from "@/features/settings/cache/syncUserSettingsMmkv";
import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { syncExpoPushTokenForUser } from "@/features/settings/utils/syncExpoPushToken";
import { syncDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import {
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
} from "@/features/transactions/api/transactionsApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { APP_QUERY_GC_MS, APP_QUERY_STALE_MS } from "@/lib/queryDefaults";
import { QUERY_CACHE_MAX_AGE_MS, queryPersister } from "@/lib/queryPersister";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

export const appQueryPersistOptions = {
  persister: queryPersister,
  maxAge: QUERY_CACHE_MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === "success" &&
      query.queryKey[0] !== notificationQueryKeys.all[0],
  },
} as const;

function restoreQueryCache(queryClient: QueryClient): boolean {
  try {
    const persisted = queryPersister.restoreClient() as
      | PersistedClient
      | undefined;

    if (!persisted?.timestamp) {
      return false;
    }

    if (Date.now() - persisted.timestamp > QUERY_CACHE_MAX_AGE_MS) {
      queryPersister.removeClient();
      return false;
    }

    hydrate(queryClient, persisted.clientState);
    return true;
  } catch (error) {
    console.error(
      "[appBootstrap] corrupt or incompatible query cache — clearing MMKV",
      error,
    );
    queryPersister.removeClient();
    return false;
  }
}

/** Sync MMKV → React Query (main cache blob + notifications). Runs once at launch. */
export function hydrateAppFromMmkv(queryClient: QueryClient): void {
  const queryCacheRestored = restoreQueryCache(queryClient);
  const notificationsRestored = hydrateNotificationsFromMmkv(queryClient);
  const userSettingsRestored = hydrateUserSettingsFromMmkv(queryClient);

  if (__DEV__) {
    console.log("[appBootstrap] hydrated from MMKV", {
      queryCacheRestored,
      notificationsRestored,
      userSettingsRestored,
    });
  }
}

export function createAppQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        console.error(
          `[QueryCache] fetch failed — key: ${JSON.stringify(query.queryKey)}`,
          error,
        );
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        console.error(
          `[MutationCache] mutation failed — key: ${JSON.stringify(mutation.options.mutationKey ?? "unnamed")}`,
          error,
        );
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: APP_QUERY_STALE_MS,
        gcTime: APP_QUERY_GC_MS,
        retry: 1,
      },
    },
  });

  hydrateAppFromMmkv(queryClient);
  return queryClient;
}

function isCacheFresh(queryClient: QueryClient, queryKey: QueryKey): boolean {
  const state = queryClient.getQueryState(queryKey);
  if (state?.data === undefined || !state.dataUpdatedAt) {
    return false;
  }
  return Date.now() - state.dataUpdatedAt < APP_QUERY_STALE_MS;
}

function prefetchIfStale<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
): void {
  if (isCacheFresh(queryClient, queryKey)) {
    return;
  }
  void queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: APP_QUERY_STALE_MS,
  });
}

/** Background warm-up for sibling tabs (skips keys already fresh in MMKV). */
export function prefetchSiblingTabQueries(
  queryClient: QueryClient,
  userId: string,
): void {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthIndex0 = now.getMonth();
  const timezone = getDeviceIanaTimezone();
  const { from, to } = monthRangeIso(year, monthIndex0);

  prefetchIfStale(
    queryClient,
    insightsQueryKeys.month(userId, year, month, timezone),
    () => fetchMonthInsights({ year, month, timezone }),
  );
  prefetchIfStale(queryClient, categoriesQueryKeys.list(), fetchCategories);
  prefetchIfStale(queryClient, budgetQueryKey, fetchBudget);
  prefetchIfStale(queryClient, categoryBudgetsQueryKey, fetchCategoryBudgets);

  void (async () => {
    try {
      const settings = await queryClient.fetchQuery({
        queryKey: settingsQueryKeys.user(),
        queryFn: fetchUserSettings,
      });

      if (settings.deviceNotificationsEnabled) {
        await syncExpoPushTokenForUser(true);
      }

      await syncDailyExpenseReminderSchedule({
        enabled: settings.dailyExpenseReminderEnabled,
        time: settings.dailyExpenseReminderTime,
        deviceNotificationsEnabled: settings.deviceNotificationsEnabled,
      });
    } catch (error) {
      console.warn(
        "[appBootstrap] Failed to sync notification schedules on bootstrap",
        error,
      );
    }
  })();

  const monthPagesKey = transactionsQueryKeys.monthPages(
    userId,
    year,
    month,
    timezone,
  );

  if (!isCacheFresh(queryClient, monthPagesKey)) {
    void queryClient.prefetchInfiniteQuery({
      queryKey: monthPagesKey,
      queryFn: ({ pageParam }) =>
        fetchTransactionsPage({
          from,
          to,
          limit: TX_PAGE_LIMIT,
          offset: pageParam as number,
        }),
      initialPageParam: 0,
      staleTime: APP_QUERY_STALE_MS,
    });
  }
}
