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
  userId: string | undefined,
): boolean {
  const snapshot = readPersistedNotifications(userId);
  if (!snapshot) {
    return false;
  }

  // An empty inbox is never seeded: it would read as "no notifications" until the first fetch.
  // `updatedAt` keeps the seed's real age so a stale snapshot is refetched on mount.
  if (snapshot.inbox.length > 0) {
    queryClient.setQueryData(
      notificationQueryKeys.inboxList(userId),
      buildInboxData(
        snapshot.inbox,
        resolveSeedCursor(
          snapshot.inbox,
          snapshot.nextCursor,
          NOTIFICATIONS_PAGE_LIMIT,
        ),
      ),
      { updatedAt: snapshot.timestamp },
    );
  }
  queryClient.setQueryData(
    notificationQueryKeys.unreadCount(userId),
    snapshot.unreadCount,
    { updatedAt: snapshot.timestamp },
  );
  return true;
}

/**
 * Writes the current React Query notification caches to MMKV. Only the first page is kept:
 * it is a cold-start seed, and older pages are fetched on demand.
 */
export function persistNotificationsMmkvFromQueryClient(
  queryClient: QueryClient,
  userId: string,
): void {
  const inbox = queryClient.getQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(userId),
  );
  const unreadCount = queryClient.getQueryData<number>(
    notificationQueryKeys.unreadCount(userId),
  );

  if (inbox === undefined && unreadCount === undefined) {
    return;
  }

  const existing = readPersistedNotifications(userId);
  const firstPage = inbox?.pages[0];
  const items = firstPage?.items ?? existing?.inbox;
  if (!items) {
    return;
  }

  writePersistedNotifications(userId, {
    inbox: items,
    unreadCount: unreadCount ?? existing?.unreadCount ?? 0,
    nextCursor: firstPage ? firstPage.nextCursor : existing?.nextCursor,
  });
}
