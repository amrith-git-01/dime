import { createMMKV } from "react-native-mmkv";

import type { AppNotification } from "@/features/notifications/types";
import { APP_QUERY_GC_MS } from "@/lib/queryDefaults";

const notificationsMmkv = createMMKV({ id: "notifications" });

export const NOTIFICATIONS_MMKV_KEY = "dime:notifications";
const LAST_RESPONSE_STAMP_KEY = "dime:last-notification-response-stamp";

export type NotificationsMmkvSnapshot = {
  timestamp: number;
  /** First page of the inbox only; older pages are fetched on demand. */
  inbox: AppNotification[];
  unreadCount: number;
  /** Cursor for the page after `inbox`; absent in snapshots written before pagination. */
  nextCursor?: string | null;
};

export function hasPersistedNotifications(): boolean {
  return notificationsMmkv.contains(NOTIFICATIONS_MMKV_KEY);
}

/** Synchronous read of inbox + unread badge (no network). */
export function readPersistedNotifications(): NotificationsMmkvSnapshot | null {
  const raw = notificationsMmkv.getString(NOTIFICATIONS_MMKV_KEY);
  if (!raw) {
    return null;
  }

  try {
    const snapshot = JSON.parse(raw) as NotificationsMmkvSnapshot;
    if (
      !snapshot?.timestamp ||
      !Array.isArray(snapshot.inbox) ||
      typeof snapshot.unreadCount !== "number"
    ) {
      return null;
    }
    if (Date.now() - snapshot.timestamp > APP_QUERY_GC_MS) {
      notificationsMmkv.remove(NOTIFICATIONS_MMKV_KEY);
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function writePersistedNotifications(
  snapshot: Omit<NotificationsMmkvSnapshot, "timestamp">,
): void {
  const payload: NotificationsMmkvSnapshot = {
    ...snapshot,
    timestamp: Date.now(),
  };
  notificationsMmkv.set(NOTIFICATIONS_MMKV_KEY, JSON.stringify(payload));
}

export function clearPersistedNotifications(): void {
  notificationsMmkv.remove(NOTIFICATIONS_MMKV_KEY);
}

export function readLastHandledNotificationResponseStamp(): string | null {
  return notificationsMmkv.getString(LAST_RESPONSE_STAMP_KEY) ?? null;
}

export function writeLastHandledNotificationResponseStamp(stamp: string): void {
  notificationsMmkv.set(LAST_RESPONSE_STAMP_KEY, stamp);
}
