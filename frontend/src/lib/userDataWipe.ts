import type { QueryClient } from "@tanstack/react-query";

import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { clearPersistedNotifications } from "@/lib/notifications/notificationsMmkv";
import { clearQueryMmkv } from "@/lib/queryPersister";
import { clearPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { useCurrentUserStore } from "@/stores/currentUserStore";

/**
 * Clears API-derived MMKV (React Query cache blob, notifications, settings, profile).
 * Does not touch auth, capture preferences, or other device settings.
 */
export function clearAppDataMmkv(): void {
  clearQueryMmkv();
  clearPersistedNotifications();
  clearPersistedUserSettings();
  useCurrentUserStore.getState().clearProfile();
}

/**
 * Drops everything the previous user's data lives in: in-flight and cached queries, the
 * persisted snapshots and the realtime echo tracker. Synchronous on purpose: on a user switch it
 * must finish before the new user's queries start, or it would wipe them too.
 */
export function wipeUserData(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
  clearAppDataMmkv();
  recentTransactionMutations.clear();
}
