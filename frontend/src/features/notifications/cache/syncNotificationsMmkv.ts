import type { QueryClient } from "@tanstack/react-query";

import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";

import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification } from "../types";

/** Seeds React Query from the dedicated notifications MMKV key at cold start. */
export function hydrateNotificationsFromMmkv(
  queryClient: QueryClient,
): boolean {
  const snapshot = readPersistedNotifications();
  if (!snapshot) {
    return false;
  }

  queryClient.setQueryData(notificationQueryKeys.inboxList(), snapshot.inbox);
  queryClient.setQueryData(
    notificationQueryKeys.unreadCount(),
    snapshot.unreadCount,
  );
  return true;
}

/** Writes the current React Query notification caches to MMKV. */
export function persistNotificationsMmkvFromQueryClient(
  queryClient: QueryClient,
): void {
  const inbox = queryClient.getQueryData<AppNotification[]>(
    notificationQueryKeys.inboxList(),
  );
  const unreadCount = queryClient.getQueryData<number>(
    notificationQueryKeys.unreadCount(),
  );

  if (inbox === undefined && unreadCount === undefined) {
    return;
  }

  const existing = readPersistedNotifications();

  writePersistedNotifications({
    inbox: inbox ?? existing?.inbox ?? [],
    unreadCount: unreadCount ?? existing?.unreadCount ?? 0,
  });
}
