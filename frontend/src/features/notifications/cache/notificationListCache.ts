import type { QueryClient } from "@tanstack/react-query";

import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification } from "../types";

export function setInboxListCache(
  queryClient: QueryClient,
  items: AppNotification[],
): void {
  queryClient.setQueryData(notificationQueryKeys.inboxList(), items);
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
}

export function removeInboxNotification(
  queryClient: QueryClient,
  id: string,
): void {
  queryClient.setQueryData<AppNotification[]>(
    notificationQueryKeys.inboxList(),
    (prev) => (prev ? prev.filter((item) => item.id !== id) : prev),
  );
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
}
