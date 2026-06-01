import type { NotificationInboxFilter } from "./types";

export const notificationQueryKeys = {
  all: ["notifications"] as const,
  list: (filter: NotificationInboxFilter) =>
    [...notificationQueryKeys.all, "list", filter] as const,
  unreadCount: () => [...notificationQueryKeys.all, "unreadCount"] as const,
};
