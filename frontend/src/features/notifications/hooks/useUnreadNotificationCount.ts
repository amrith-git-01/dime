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
        // Only the badge changes here. The snapshot's inbox is a real first page (from the
        // inbox query or an earlier snapshot): never invent an empty one.
        const firstPage = queryClient.getQueryData<NotificationsInboxData>(
          notificationQueryKeys.inboxList(userId),
        )?.pages[0];
        const persisted = readPersistedNotifications(userId);
        const inbox = firstPage?.items ?? persisted?.inbox;
        if (inbox) {
          writePersistedNotifications(userId, {
            inbox,
            unreadCount: count,
            nextCursor: firstPage
              ? firstPage.nextCursor
              : persisted?.nextCursor,
          });
        }
      }
      return count;
    },
    placeholderData: () => readPersistedNotifications(userId)?.unreadCount,
  });
}
