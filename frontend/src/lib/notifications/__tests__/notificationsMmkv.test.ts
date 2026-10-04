import { createMMKV } from "react-native-mmkv";

import { CACHE_SCHEMA_VERSION } from "@/lib/cacheVersion";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  NOTIFICATIONS_MMKV_KEY,
  readPersistedNotifications,
  writePersistedNotifications,
} from "../notificationsMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const snapshot = { inbox: [], unreadCount: 4, nextCursor: null };

describe("notifications MMKV snapshot", () => {
  beforeEach(resetMockMmkv);

  it("round-trips for the owning user", () => {
    writePersistedNotifications("user-a", snapshot);
    expect(readPersistedNotifications("user-a")).toMatchObject({
      unreadCount: 4,
      userId: "user-a",
      version: CACHE_SCHEMA_VERSION,
    });
  });

  it("refuses and drops a snapshot written for another user", () => {
    writePersistedNotifications("user-a", snapshot);
    expect(readPersistedNotifications("user-b")).toBeNull();
    // Dropped, so it cannot resurface for user A either.
    expect(readPersistedNotifications("user-a")).toBeNull();
  });

  it("refuses a snapshot written by another schema version", () => {
    writePersistedNotifications("user-a", snapshot);
    const store = createMMKV({ id: "notifications" });
    const stored = JSON.parse(
      store.getString(NOTIFICATIONS_MMKV_KEY) as string,
    );
    store.set(
      NOTIFICATIONS_MMKV_KEY,
      JSON.stringify({ ...stored, version: CACHE_SCHEMA_VERSION - 1 }),
    );
    expect(readPersistedNotifications("user-a")).toBeNull();
  });

  it("refuses an untagged legacy snapshot", () => {
    createMMKV({ id: "notifications" }).set(
      NOTIFICATIONS_MMKV_KEY,
      JSON.stringify({ timestamp: Date.now(), inbox: [], unreadCount: 1 }),
    );
    expect(readPersistedNotifications("user-a")).toBeNull();
  });

  it("returns null without a user id", () => {
    writePersistedNotifications("user-a", snapshot);
    expect(readPersistedNotifications(undefined)).toBeNull();
  });
});
