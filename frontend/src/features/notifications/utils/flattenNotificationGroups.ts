import type { AppNotification, NotificationDateGroup } from "../types";

export type NotificationListItem =
  | { kind: "header"; id: string; title: string; isFirst: boolean }
  | { kind: "row"; id: string; notification: AppNotification };

/** Flattens date groups into FlashList items: one header item before each group's rows. */
export function flattenNotificationGroups(
  groups: NotificationDateGroup[],
): NotificationListItem[] {
  const items: NotificationListItem[] = [];
  groups.forEach((group, groupIndex) => {
    items.push({
      kind: "header",
      id: `header:${group.key}`,
      title: group.title,
      isFirst: groupIndex === 0,
    });
    for (const notification of group.items) {
      items.push({ kind: "row", id: notification.id, notification });
    }
  });
  return items;
}
