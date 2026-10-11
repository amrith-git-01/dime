import type { QueryClient } from "@tanstack/react-query";

import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification } from "../types";
import {
  patchNotificationInPages,
  removeNotificationFromPages,
  restoreNotificationInPages,
  type NotificationsInboxData,
} from "../utils/notificationPages";
import { persistNotificationsMmkvFromQueryClient } from "./syncNotificationsMmkv";

function syncMmkv(queryClient: QueryClient, userId: string | undefined): void {
  if (userId) {
    persistNotificationsMmkvFromQueryClient(queryClient, userId);
  }
}

export function patchInboxNotification(
  queryClient: QueryClient,
  userId: string | undefined,
  id: string,
  patch: Partial<AppNotification>,
): void {
  queryClient.setQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(userId),
    (prev) => (prev ? patchNotificationInPages(prev, id, patch) : prev),
  );
  syncMmkv(queryClient, userId);
}

export function removeInboxNotification(
  queryClient: QueryClient,
  userId: string | undefined,
  id: string,
): void {
  queryClient.setQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(userId),
    (prev) => (prev ? removeNotificationFromPages(prev, id) : prev),
  );
  syncMmkv(queryClient, userId);
}

/** Undoes an optimistic delete. */
export function restoreInboxNotification(
  queryClient: QueryClient,
  userId: string | undefined,
  notification: AppNotification,
): void {
  queryClient.setQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(userId),
    (prev) => (prev ? restoreNotificationInPages(prev, notification) : prev),
  );
  syncMmkv(queryClient, userId);
}

export function adjustUnreadCountCache(
  queryClient: QueryClient,
  userId: string | undefined,
  delta: number,
): void {
  if (delta === 0) return;
  queryClient.setQueryData<number>(
    notificationQueryKeys.unreadCount(userId),
    (prev) => Math.max(0, (prev ?? 0) + delta),
  );
  syncMmkv(queryClient, userId);
}
