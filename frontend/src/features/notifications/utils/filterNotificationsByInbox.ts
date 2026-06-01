import type { AppNotification, NotificationInboxFilter } from "../types";

/** Client-side inbox filter (single ``all`` fetch, no per-tab API calls). */
export function filterNotificationsByInbox(
  items: AppNotification[],
  filter: NotificationInboxFilter,
): AppNotification[] {
  if (filter === "unread") {
    return items.filter((item) => item.readAt == null);
  }
  if (filter === "read") {
    return items.filter((item) => item.readAt != null);
  }
  return items;
}
