import { QueryClient } from "@tanstack/react-query";

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
import {
  fetchNotificationsPage,
  fetchUnreadNotificationCount,
} from "@/features/notifications/api/notificationsApi";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { buildInboxData } from "@/features/notifications/utils/notificationPages";
import { fetchMe } from "@/features/profile/api/meApi";
import { profileQueryKeys } from "@/features/profile/queryKeys";
import { fetchUserSettings } from "@/features/settings/api/settingsApi";
import { settingsQueryKeys } from "@/features/settings/queryKeys";
import {
  fetchHomeOverview,
  fetchTransactionsPage,
  monthRangeIso,
  TX_PAGE_LIMIT,
} from "@/features/transactions/api/transactionsApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import {
  clearPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";
import { clearQueryMmkv } from "@/lib/queryPersister";
import {
  clearPersistedUserSettings,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import { useCurrentUserStore } from "@/stores/currentUserStore";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

/**
 * Clears API-derived MMKV (React Query cache blob, notifications, profile).
 * Does not touch auth, capture preferences, or other device settings.
 */
export function clearAppDataMmkv(): void {
  clearQueryMmkv();
  clearPersistedNotifications();
  clearPersistedUserSettings();
  useCurrentUserStore.getState().clearProfile();
}

/** Wipe local API cache and pull fresh data from the backend. */
export async function refreshAppDataFromServer(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  clearAppDataMmkv();

  await queryClient.cancelQueries();
  queryClient.clear();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthIndex0 = now.getMonth();
  const timezone = getDeviceIanaTimezone();
  const { from, to } = monthRangeIso(year, monthIndex0);

  const [inboxPage, unreadCount, userSettings] = await Promise.all([
    fetchNotificationsPage({ filter: "all" }),
    fetchUnreadNotificationCount(),
    fetchUserSettings(),
  ]);

  queryClient.setQueryData(
    notificationQueryKeys.inboxList(),
    buildInboxData(inboxPage.items, inboxPage.nextCursor),
  );
  queryClient.setQueryData(notificationQueryKeys.unreadCount(), unreadCount);
  writePersistedNotifications({
    inbox: inboxPage.items,
    unreadCount,
    nextCursor: inboxPage.nextCursor,
  });
  queryClient.setQueryData(settingsQueryKeys.user(userId), userSettings);
  writePersistedUserSettings(userSettings);

  await Promise.all([
    queryClient.fetchQuery({
      queryKey: profileQueryKeys.current(userId),
      queryFn: async () => {
        const me = await fetchMe();
        useCurrentUserStore.getState().setProfile(me);
        return me;
      },
    }),
    queryClient.fetchQuery({
      queryKey: transactionsQueryKeys.home(userId, timezone),
      queryFn: () => fetchHomeOverview(timezone),
    }),
    queryClient.fetchQuery({
      queryKey: insightsQueryKeys.month(userId, year, month, timezone),
      queryFn: () => fetchMonthInsights({ year, month, timezone }),
    }),
    queryClient.fetchQuery({
      queryKey: categoriesQueryKeys.list(userId),
      queryFn: fetchCategories,
    }),
    queryClient.fetchQuery({
      queryKey: budgetQueryKeys.current(userId),
      queryFn: fetchBudget,
    }),
    queryClient.fetchQuery({
      queryKey: categoryBudgetsQueryKeys.list(userId),
      queryFn: fetchCategoryBudgets,
    }),
    queryClient.fetchInfiniteQuery({
      queryKey: transactionsQueryKeys.monthPages(userId, year, month, timezone),
      queryFn: ({ pageParam }) =>
        fetchTransactionsPage({
          from,
          to,
          limit: TX_PAGE_LIMIT,
          offset: pageParam as number,
        }),
      initialPageParam: 0,
    }),
  ]);
}
