import type { InfiniteData } from "@tanstack/react-query";

import type { AppNotification } from "../types";

/** Page size requested from `GET /notifications` (C4 default; the server caps at 100). */
export const NOTIFICATIONS_PAGE_LIMIT = 50;

export type NotificationsPage = {
  items: AppNotification[];
  /** Cursor for the next (older) page; null when the inbox is exhausted. */
  nextCursor: string | null;
};

export type NotificationsInboxData = InfiniteData<NotificationsPage>;

/** Wraps an already-loaded first page (cold-start seeds, full refreshes) as infinite-query data. */
export function buildInboxData(
  items: AppNotification[],
  nextCursor: string | null,
): NotificationsInboxData {
  return {
    pages: [{ items, nextCursor }],
    pageParams: [undefined],
  };
}

/** Loaded notifications in page order, dropping repeats a shifting cursor can produce. */
export function flattenNotificationPages(
  data: NotificationsInboxData | undefined,
): AppNotification[] {
  if (!data) {
    return [];
  }
  const seen = new Set<string>();
  const items: AppNotification[] = [];
  for (const page of data.pages) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
  }
  return items;
}

export function findNotificationInPages(
  data: NotificationsInboxData | undefined,
  id: string,
): AppNotification | undefined {
  if (!data) {
    return undefined;
  }
  for (const page of data.pages) {
    const match = page.items.find((item) => item.id === id);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function patchNotificationInPages(
  data: NotificationsInboxData,
  id: string,
  patch: Partial<AppNotification>,
): NotificationsInboxData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  };
}

export function removeNotificationFromPages(
  data: NotificationsInboxData,
  id: string,
): NotificationsInboxData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

/** Puts a notification back at the head of the first page (undoing an optimistic delete). */
export function restoreNotificationInPages(
  data: NotificationsInboxData,
  notification: AppNotification,
): NotificationsInboxData {
  if (findNotificationInPages(data, notification.id)) {
    return data;
  }
  if (data.pages.length === 0) {
    return buildInboxData([notification], null);
  }
  const [first, ...rest] = data.pages;
  return {
    ...data,
    pages: [{ ...first, items: [notification, ...first.items] }, ...rest],
  };
}

/**
 * Cursor to resume paging from a persisted first page. Snapshots written before cursors were
 * stored have none, so a full page implies there is more behind it.
 */
export function resolveSeedCursor(
  items: AppNotification[],
  storedCursor: string | null | undefined,
  pageLimit: number,
): string | null {
  if (storedCursor !== undefined) {
    return storedCursor;
  }
  return items.length >= pageLimit
    ? (items[items.length - 1]?.createdAt ?? null)
    : null;
}
