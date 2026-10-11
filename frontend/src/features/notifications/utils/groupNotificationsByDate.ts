import { format, isSameDay, isSameYear, parseISO, subDays } from "date-fns";

import type { AppNotification, NotificationDateGroup } from "../types";

function groupTitle(date: Date, now: Date): { key: string; title: string } {
  if (isSameDay(date, now)) {
    return { key: "today", title: "Today" };
  }
  if (isSameDay(date, subDays(now, 1))) {
    return { key: "yesterday", title: "Yesterday" };
  }
  const key = format(date, "yyyy-MM-dd");
  const title = isSameYear(date, now)
    ? format(date, "d MMM")
    : format(date, "d MMM yyyy");
  return { key, title };
}

export function groupNotificationsByDate(
  items: AppNotification[],
  now: Date = new Date(),
): NotificationDateGroup[] {
  const buckets = new Map<string, NotificationDateGroup>();

  const sorted = [...items].sort(
    (a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime(),
  );

  for (const item of sorted) {
    const { key, title } = groupTitle(parseISO(item.createdAt), now);
    const existing = buckets.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(key, { key, title, items: [item] });
    }
  }

  return [...buckets.values()];
}
