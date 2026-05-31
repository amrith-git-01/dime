import { useCallback, useMemo, useState } from "react";

import { MOCK_NOTIFICATIONS } from "../fixtures/mockNotifications";
import type { AppNotification, NotificationInboxFilter } from "../types";
import { groupNotificationsByDate } from "../utils/groupNotificationsByDate";

function matchesFilter(
  notification: AppNotification,
  filter: NotificationInboxFilter,
): boolean {
  const unread = notification.readAt == null;
  if (filter === "unread") return unread;
  if (filter === "read") return !unread;
  return true;
}

export function useNotificationsFeed() {
  const [items, setItems] = useState<AppNotification[]>(MOCK_NOTIFICATIONS);
  const [filter, setFilter] = useState<NotificationInboxFilter>("all");

  const filteredItems = useMemo(
    () => items.filter((n) => matchesFilter(n, filter)),
    [filter, items],
  );

  const groups = useMemo(
    () => groupNotificationsByDate(filteredItems),
    [filteredItems],
  );

  const isInboxEmpty = items.length === 0;
  const isFilterEmpty = !isInboxEmpty && filteredItems.length === 0;

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && n.readAt == null
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
  }, []);

  const isUnread = useCallback(
    (notification: AppNotification) => notification.readAt == null,
    [],
  );

  return {
    filter,
    setFilter,
    groups,
    isInboxEmpty,
    isFilterEmpty,
    markRead,
    isUnread,
  };
}
