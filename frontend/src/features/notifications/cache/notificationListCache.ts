import type { QueryClient } from "@tanstack/react-query";

import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification } from "../types";
import { persistNotificationsMmkvFromQueryClient } from "./syncNotificationsMmkv";

function syncMmkv(queryClient: QueryClient): void {
  persistNotificationsMmkvFromQueryClient(queryClient);
}

export function setInboxListCache(
  queryClient: QueryClient,
  items: AppNotification[],
): void {
  queryClient.setQueryData(notificationQueryKeys.inboxList(), items);
  syncMmkv(queryClient);
}

export function patchInboxNotification(
  queryClient: QueryClient,
  id: string,
  patch: Partial<AppNotification>,
): void {
  queryClient.setQueryData<AppNotification[]>(
    notificationQueryKeys.inboxList(),
    (prev) => {
      if (!prev) return prev;
      return prev.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      );
    },
  );
  syncMmkv(queryClient);
}

export function removeInboxNotification(
  queryClient: QueryClient,
  id: string,
): void {
  queryClient.setQueryData<AppNotification[]>(
    notificationQueryKeys.inboxList(),
    (prev) => (prev ? prev.filter((item) => item.id !== id) : prev),
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
