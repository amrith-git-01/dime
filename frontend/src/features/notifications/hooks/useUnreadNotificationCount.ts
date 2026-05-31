import { useQuery } from "@tanstack/react-query";

import { fetchUnreadNotificationCount } from "../api/notificationsApi";
import { notificationQueryKeys } from "../queryKeys";

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationQueryKeys.unreadCount(),
    queryFn: fetchUnreadNotificationCount,
    staleTime: 30_000,
  });
}
