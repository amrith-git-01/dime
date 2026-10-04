import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  MutationCache,
  onlineManager,
  QueryCache,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
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
import { restoreQueryCache } from "@/lib/queryPersister";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";
import { subscribeUserTransitionWipe } from "@/lib/userTransitionWipe";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";
import { reportError } from "@/lib/reportError";

/** Sync MMKV → React Query (main cache blob + notifications). Runs once at launch. */
export function hydrateAppFromMmkv(queryClient: QueryClient): void {
  const userId = readStoredAuthSession()?.user.id;
  const queryCacheRestored = restoreQueryCache(queryClient);
  const notificationsRestored = hydrateNotificationsFromMmkv(
    queryClient,
    userId,
  );
  const userSettingsRestored = hydrateUserSettingsFromMmkv(queryClient, userId);

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
  // Registered synchronously, before any async auth event can arrive; lives as long as the app.
  subscribeUserTransitionWipe(queryClient);
  return queryClient;
}

/** After this long in the background, server-side changes (alerts, pushes) are likely. */
const LONG_BACKGROUND_MS = 60_000;

/**
 * Feeds React Query the app's real focus/online signals so stale queries refetch when the
 * app returns to the foreground or the network comes back. After a long background stay it also
 * invalidates data the server changes on its own (realtime is not delivered while suspended).
 * Returns an unsubscribe function.
 */
export function subscribeQueryClientLifecycle(
  queryClient: QueryClient,
): () => void {
  let backgroundedAt: number | null = null;
  const appStateSub = AppState.addEventListener("change", (status) => {
    focusManager.setFocused(status === "active");
    if (status !== "active") {
      backgroundedAt ??= Date.now();
      return;
    }
    const wasLong =
      backgroundedAt !== null && Date.now() - backgroundedAt > LONG_BACKGROUND_MS;
    backgroundedAt = null;
    if (wasLong) {
      invalidateServerDrivenQueries(queryClient);
    }
  });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    }),
  );
  return () => appStateSub.remove();
}

function invalidateServerDrivenQueries(queryClient: QueryClient): void {
  for (const queryKey of [
    insightsQueryKeys.all,
    notificationQueryKeys.all,
    budgetQueryKeys.all,
    categoryBudgetsQueryKeys.all,
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
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
  staleMs: number = APP_QUERY_STALE_MS,
): void {
  if (isCacheFresh(queryClient, queryKey, staleMs)) {
    return;
  }
  void queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: staleMs,
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
    TRANSACTIONS_QUERY_STALE_MS,
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
