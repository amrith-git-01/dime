import { createMMKV } from "react-native-mmkv";

import type { AppNotification } from "@/features/notifications/types";
import { normalizeNotification } from "@/features/notifications/utils/normalizeNotification";
import { CACHE_SCHEMA_VERSION } from "@/lib/cacheVersion";
import { APP_QUERY_GC_MS } from "@/lib/queryDefaults";

const notificationsMmkv = createMMKV({ id: "notifications" });

export const NOTIFICATIONS_MMKV_KEY = "dime:notifications";
const LAST_RESPONSE_STAMP_KEY = "dime:last-notification-response-stamp";

export type NotificationsMmkvSnapshot = {
  version: number;
  /** Owner of the snapshot; it is never read back for another user. */
  userId: string;
  timestamp: number;
  /** First page of the inbox only; older pages are fetched on demand. */
  inbox: AppNotification[];
  unreadCount: number;
  /** Cursor for the page after `inbox`. */
  nextCursor?: string | null;
};

export function hasPersistedNotifications(): boolean {
  return notificationsMmkv.contains(NOTIFICATIONS_MMKV_KEY);
}

/**
 * Synchronous read of inbox + unread badge (no network). Returns null, and drops the stored
 * snapshot, when it belongs to another user or was written by another schema version.
 */
export function readPersistedNotifications(
  userId: string | undefined,
): NotificationsMmkvSnapshot | null {
  const raw = notificationsMmkv.getString(NOTIFICATIONS_MMKV_KEY);
  if (!raw || !userId) {
    return null;
  }

  try {
    const snapshot = JSON.parse(raw) as NotificationsMmkvSnapshot;
    if (
      snapshot?.version !== CACHE_SCHEMA_VERSION ||
      snapshot.userId !== userId
    ) {
      notificationsMmkv.remove(NOTIFICATIONS_MMKV_KEY);
      return null;
    }
    if (
      !snapshot.timestamp ||
      !Array.isArray(snapshot.inbox) ||
      typeof snapshot.unreadCount !== "number"
    ) {
      return null;
    }
    if (Date.now() - snapshot.timestamp > APP_QUERY_GC_MS) {
      notificationsMmkv.remove(NOTIFICATIONS_MMKV_KEY);
      return null;
    }
    // Written by this or another build: a kind or action this build cannot handle must not get through.
    return {
      ...snapshot,
      inbox: snapshot.inbox
        .filter((item) => item != null && typeof item === "object")
        .map(normalizeNotification),
    };
  } catch {
    return null;
  }
}

export function writePersistedNotifications(
  userId: string,
  snapshot: Omit<NotificationsMmkvSnapshot, "timestamp" | "userId" | "version">,
): void {
  const payload: NotificationsMmkvSnapshot = {
    ...snapshot,
    version: CACHE_SCHEMA_VERSION,
    userId,
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
