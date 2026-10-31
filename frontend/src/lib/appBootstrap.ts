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
import { reportQueryKeys } from "@/features/brokeReport/queryKeys";
import { reminderQueryKeys } from "@/features/reminders/queryKeys";
import { fetchCategories } from "@/features/categories/api/categoriesApi";
import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import { hydrateNotificationsFromMmkv } from "@/features/notifications/cache/syncNotificationsMmkv";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { fetchUserSettings } from "@/features/settings/api/settingsApi";
import { hydrateUserSettingsFromMmkv } from "@/features/settings/cache/syncUserSettingsMmkv";
import { settingsQueryKeys } from "@/features/settings/queryKeys";
import type { UserSettings } from "@/features/settings/types";
import { overlayPendingLayouts } from "@/features/settings/utils/settingsPatchRollback";
import { syncDeviceTimezone } from "@/features/settings/utils/syncDeviceTimezone";
import { readPendingCardLayoutScreens } from "@/lib/settings/userSettingsMmkv";
import {
  PushPermissionDeniedError,
  syncExpoPushTokenForUser,
} from "@/features/settings/utils/syncExpoPushToken";
import { syncDailyExpenseReminderSchedule } from "@/lib/notifications/dailyExpenseReminderSchedule";
import { transactionsMonthPagesQueryOptions } from "@/features/transactions/api/monthPagesQueryOptions";
import {
  APP_QUERY_GC_MS,
  APP_QUERY_STALE_MS,
  TRANSACTIONS_QUERY_STALE_MS,
} from "@/lib/queryDefaults";
import { restoreQueryCache } from "@/lib/queryPersister";
import { readStoredAuthSession } from "@/lib/auth/authStorage";
import { clearAppDataMmkv } from "@/lib/userDataWipe";
import { subscribeUserTransitionWipe } from "@/lib/userTransitionWipe";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { reportError } from "@/lib/reportError";

/** Sync MMKV → React Query (main cache blob + notifications). Runs once at launch. */
export function hydrateAppFromMmkv(queryClient: QueryClient): void {
  const userId = readStoredAuthSession()?.user.id;
  if (!userId) {
    // No session: whatever API data is on disk belongs to nobody (e.g. a restored backup or a
    // sign-out that was interrupted). Drop it instead of showing it to the next user.
    clearAppDataMmkv();
    return;
  }
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
      const online = state.isConnected !== false;
      setOnline(online);
      // onlineManager has no subscribe in query-core 5.101: the UI and the outbox read this store.
      useConnectivityStore.getState().setOnline(online);
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
    // A report may have been built while the app slept (the 1st); snapshots themselves never change.
    reportQueryKeys.all,
    // Reminders move on by themselves: a repeating one gets its next date, a push may have landed.
    reminderQueryKeys.all,
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

  prefetchIfStale(
    queryClient,
    insightsQueryKeys.month(userId, year, month, timezone),
    () => fetchMonthInsights({ year, month, timezone }),
    TRANSACTIONS_QUERY_STALE_MS,
  );
  prefetchIfStale(
    queryClient,
    categoriesQueryKeys.list(userId, "spend"),
    () => fetchCategories("spend"),
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
        // An arranged order the server has not heard about yet stays as it is on this device.
        queryFn: async () =>
          overlayPendingLayouts(
            await fetchUserSettings(),
            queryClient.getQueryData<UserSettings>(settingsQueryKeys.user(userId)),
            readPendingCardLayoutScreens(userId),
          ),
      });

      // Reminders fire in the user's own clock: tell the server where this device is. Never awaited.
      void syncDeviceTimezone(queryClient, userId, settings);

      if (settings.deviceNotificationsEnabled) {
        // Remote push registration must never block the local schedules below. Check-only: the
        // permission dialog is asked for in context (see askNotificationsInContext), never at launch.
        try {
          await syncExpoPushTokenForUser(true, { requestPermission: false });
        } catch (error) {
          // Declined notifications is the user's choice, not an error worth reporting.
          if (!(error instanceof PushPermissionDeniedError)) {
            reportError(error, "appBootstrap failed to register push token");
          }
        }
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

  const monthPagesOptions = transactionsMonthPagesQueryOptions({
    userId,
    year,
    monthIndex0,
    timezone,
  });

  if (
    !isCacheFresh(
      queryClient,
      monthPagesOptions.queryKey,
      TRANSACTIONS_QUERY_STALE_MS,
    )
  ) {
    void queryClient.prefetchInfiniteQuery(monthPagesOptions);
  }
}
