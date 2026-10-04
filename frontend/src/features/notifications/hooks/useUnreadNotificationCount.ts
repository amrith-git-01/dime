import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";
import { NOTIFICATIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";

import { fetchUnreadNotificationCount } from "../api/notificationsApi";
import { notificationQueryKeys } from "../queryKeys";
import type { NotificationsInboxData } from "../utils/notificationPages";

export function useUnreadNotificationCount() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(userId),
    enabled: Boolean(userId),
    staleTime: NOTIFICATIONS_QUERY_STALE_MS,
    queryFn: async () => {
      const count = await fetchUnreadNotificationCount();
      if (userId) {
        const firstPage = queryClient.getQueryData<NotificationsInboxData>(
          notificationQueryKeys.inboxList(userId),
        )?.pages[0];
        const persisted = readPersistedNotifications(userId);
        writePersistedNotifications(userId, {
          inbox: firstPage?.items ?? persisted?.inbox ?? [],
          unreadCount: count,
          nextCursor: firstPage ? firstPage.nextCursor : persisted?.nextCursor,
        });
      }
      return count;
    },
    placeholderData: () => readPersistedNotifications(userId)?.unreadCount,
  });
}
