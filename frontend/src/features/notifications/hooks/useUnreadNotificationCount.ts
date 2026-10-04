import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";

import { fetchUnreadNotificationCount } from "../api/notificationsApi";
import { notificationQueryKeys } from "../queryKeys";
import type { NotificationsInboxData } from "../utils/notificationPages";

export function useUnreadNotificationCount() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: async () => {
      const count = await fetchUnreadNotificationCount();
      const firstPage = queryClient.getQueryData<NotificationsInboxData>(
        notificationQueryKeys.inboxList(),
      )?.pages[0];
      const persisted = readPersistedNotifications();
      writePersistedNotifications({
        inbox: firstPage?.items ?? persisted?.inbox ?? [],
        unreadCount: count,
        nextCursor: firstPage ? firstPage.nextCursor : persisted?.nextCursor,
      });
      return count;
    },
    placeholderData: () => readPersistedNotifications()?.unreadCount,
  });
}
