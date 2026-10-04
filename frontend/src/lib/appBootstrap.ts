import NetInfo from "@react-native-community/netinfo";
import { hydrate } from "@tanstack/query-core";
import {
  focusManager,
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { AppState } from "react-native";

import { fetchMonthInsights } from "@/features/analytics/api/fetchMonthInsights";
import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { fetchBudget } from "@/features/budgets/api/budgetsApi";
import { fetchCategoryBudgets } from "@/features/budgets/api/categoryBudgetsApi";
import {
  budgetQueryKeys,
  categoryBudgetsQueryKeys,
} from "@/features/budgets/queryKeys";
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
import {
  APP_QUERY_GC_MS,
  APP_QUERY_STALE_MS,
  TRANSACTIONS_QUERY_STALE_MS,
} from "@/lib/queryDefaults";
import { QUERY_CACHE_MAX_AGE_MS, queryPersister } from "@/lib/queryPersister";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";
import { reportError } from "@/lib/reportError";

export const appQueryPersistOptions = {
  persister: queryPersister,
  maxAge: QUERY_CACHE_MAX_AGE_MS,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === "success" &&
      query.queryKey[0] !== notificationQueryKeys.all[0] &&
      // Detail rows carry short-lived signed media URLs (C7); never restore them from disk.
      !(
        query.queryKey[0] === transactionsQueryKeys.all[0] &&
        query.queryKey[1] === "detail"
      ),
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
    reportError(
      error,
      "appBootstrap corrupt or incompatible query cache, clearing MMKV",
    );
    queryPersister.removeClient();
    return false;
  }
}

/** Sync MMKV → React Query (main cache blob + notifications). Runs once at launch. */
export function hydrateAppFromMmkv(queryClient: QueryClient): void {
  const queryCacheRestored = restoreQueryCache(queryClient);
  const notificationsRestored = hydrateNotificationsFromMmkv(queryClient);
  const userSettingsRestored = hydrateUserSettingsFromMmkv(
    queryClient,
    readStoredAuthSession()?.user.id,
  );

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
        reportError(
          error,
          `QueryCache fetch failed, key: ${JSON.stringify(query.queryKey)}`,
        );
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        reportError(
          error,
          `MutationCache mutation failed, key: ${JSON.stringify(mutation.options.mutationKey ?? "unnamed")}`,
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

/**
 * Feeds React Query the app's real focus/online signals so stale queries refetch when the
 * app returns to the foreground or the network comes back. Returns an unsubscribe function.
 */
export function subscribeQueryClientLifecycle(): () => void {
  const appStateSub = AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
  });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    }),
  );
  return () => appStateSub.remove();
}

function isCacheFresh(
  queryClient: QueryClient,
  queryKey: QueryKey,
  staleMs: number = APP_QUERY_STALE_MS,
): boolean {
  const state = queryClient.getQueryState(queryKey);
  if (state?.data === undefined || !state.dataUpdatedAt) {
    return false;
  }
  return Date.now() - state.dataUpdatedAt < staleMs;
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
  prefetchIfStale(
    queryClient,
    categoriesQueryKeys.list(userId),
    fetchCategories,
  );
  prefetchIfStale(queryClient, budgetQueryKeys.current(userId), fetchBudget);
  prefetchIfStale(
    queryClient,
    categoryBudgetsQueryKeys.list(userId),
    fetchCategoryBudgets,
  );

  void (async () => {
    try {
      const settings = await queryClient.fetchQuery({
        queryKey: settingsQueryKeys.user(userId),
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
      reportError(
        error,
        "appBootstrap failed to sync notification schedules",
      );
    }
  })();

  const monthPagesKey = transactionsQueryKeys.monthPages(
    userId,
    year,
    month,
    timezone,
  );

  if (!isCacheFresh(queryClient, monthPagesKey, TRANSACTIONS_QUERY_STALE_MS)) {
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
      staleTime: TRANSACTIONS_QUERY_STALE_MS,
    });
  }
}
