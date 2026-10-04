import type { QueryClient } from "@tanstack/react-query";

import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";

import { notificationQueryKeys } from "../queryKeys";
import {
  buildInboxData,
  NOTIFICATIONS_PAGE_LIMIT,
  resolveSeedCursor,
  type NotificationsInboxData,
} from "../utils/notificationPages";

/** Seeds React Query from the dedicated notifications MMKV key at cold start. */
export function hydrateNotificationsFromMmkv(
  queryClient: QueryClient,
): boolean {
  const snapshot = readPersistedNotifications();
  if (!snapshot) {
    return false;
  }

  queryClient.setQueryData(
    notificationQueryKeys.inboxList(),
    buildInboxData(
      snapshot.inbox,
      resolveSeedCursor(
        snapshot.inbox,
        snapshot.nextCursor,
        NOTIFICATIONS_PAGE_LIMIT,
      ),
    ),
  );
  queryClient.setQueryData(
    notificationQueryKeys.unreadCount(),
    snapshot.unreadCount,
  );
  return true;
}

/**
 * Writes the current React Query notification caches to MMKV. Only the first page is kept:
 * it is a cold-start seed, and older pages are fetched on demand.
 */
export function persistNotificationsMmkvFromQueryClient(
  queryClient: QueryClient,
): void {
  const inbox = queryClient.getQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(),
  );
  const unreadCount = queryClient.getQueryData<number>(
    notificationQueryKeys.unreadCount(),
  );

  if (inbox === undefined && unreadCount === undefined) {
    return;
  }

  const existing = readPersistedNotifications();
  const firstPage = inbox?.pages[0];

  writePersistedNotifications({
    inbox: firstPage?.items ?? existing?.inbox ?? [],
    unreadCount: unreadCount ?? existing?.unreadCount ?? 0,
    nextCursor: firstPage ? firstPage.nextCursor : existing?.nextCursor,
  });
}
