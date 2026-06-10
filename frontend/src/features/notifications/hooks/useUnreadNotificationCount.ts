import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";

import { fetchUnreadNotificationCount } from "../api/notificationsApi";
import { notificationQueryKeys } from "../queryKeys";
import type { AppNotification } from "../types";

export function useUnreadNotificationCount() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: async () => {
      const count = await fetchUnreadNotificationCount();
      const inbox =
        queryClient.getQueryData<AppNotification[]>(
          notificationQueryKeys.inboxList(),
        ) ??
        readPersistedNotifications()?.inbox ??
        [];
      writePersistedNotifications({ inbox, unreadCount: count });
      return count;
    },
    placeholderData: () => readPersistedNotifications()?.unreadCount,
  });
}
