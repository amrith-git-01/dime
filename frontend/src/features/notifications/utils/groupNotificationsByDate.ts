import { isToday, isYesterday, parseISO } from "date-fns";

import type {
  AppNotification,
  NotificationDateGroup,
  NotificationDateGroupKey,
} from "../types";

const GROUP_ORDER: NotificationDateGroupKey[] = [
  "today",
  "yesterday",
  "earlier",
];

const GROUP_TITLES: Record<NotificationDateGroupKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

function bucketForDate(date: Date): NotificationDateGroupKey {
  if (isToday(date)) return "today";
  if (isYesterday(date)) return "yesterday";
  return "earlier";
}

export function groupNotificationsByDate(
  items: AppNotification[],
): NotificationDateGroup[] {
  const buckets = new Map<NotificationDateGroupKey, AppNotification[]>();

  const sorted = [...items].sort(
    (a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime(),
  );

  for (const item of sorted) {
    const key = bucketForDate(parseISO(item.createdAt));
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    title: GROUP_TITLES[key],
    items: buckets.get(key) ?? [],
  }));
}
