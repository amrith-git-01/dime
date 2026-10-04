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

function syncMmkv(queryClient: QueryClient): void {
  persistNotificationsMmkvFromQueryClient(queryClient);
}

export function setInboxListCache(
  queryClient: QueryClient,
  data: NotificationsInboxData,
): void {
  queryClient.setQueryData(notificationQueryKeys.inboxList(), data);
  syncMmkv(queryClient);
}

export function patchInboxNotification(
  queryClient: QueryClient,
  id: string,
  patch: Partial<AppNotification>,
): void {
  queryClient.setQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(),
    (prev) => (prev ? patchNotificationInPages(prev, id, patch) : prev),
  );
  syncMmkv(queryClient);
}

export function removeInboxNotification(
  queryClient: QueryClient,
  id: string,
): void {
  queryClient.setQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(),
    (prev) => (prev ? removeNotificationFromPages(prev, id) : prev),
  );
  syncMmkv(queryClient);
}

/** Undoes an optimistic delete. */
export function restoreInboxNotification(
  queryClient: QueryClient,
  notification: AppNotification,
): void {
  queryClient.setQueryData<NotificationsInboxData>(
    notificationQueryKeys.inboxList(),
    (prev) => (prev ? restoreNotificationInPages(prev, notification) : prev),
  );
  syncMmkv(queryClient);
}

export function adjustUnreadCountCache(
  queryClient: QueryClient,
  delta: number,
): void {
  if (delta === 0) return;
  queryClient.setQueryData<number>(
    notificationQueryKeys.unreadCount(),
    (prev) => Math.max(0, (prev ?? 0) + delta),
  );
  syncMmkv(queryClient);
}
