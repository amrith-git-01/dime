import { QueryClient } from "@tanstack/react-query";

import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { writePersistedNotifications } from "@/lib/notifications/notificationsMmkv";

import { notificationQueryKeys } from "../../queryKeys";
import type { AppNotification } from "../../types";
import {
  hydrateNotificationsFromMmkv,
  persistNotificationsMmkvFromQueryClient,
} from "../syncNotificationsMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const USER = "user-a";

function note(id: string): AppNotification {
  return {
    id,
    kind: "transaction_auto",
    title: id,
    body: "body",
    createdAt: "2026-08-15T08:00:00",
    readAt: null,
    action: { type: "none" },
  };
}

describe("hydrateNotificationsFromMmkv", () => {
  beforeEach(resetMockMmkv);
  afterEach(() => jest.restoreAllMocks());

  it("never seeds an empty inbox (it would read as 'no notifications')", () => {
    writePersistedNotifications(USER, { inbox: [], unreadCount: 2 });
    const queryClient = new QueryClient();

    expect(hydrateNotificationsFromMmkv(queryClient, USER)).toBe(true);

    expect(
      queryClient.getQueryData(notificationQueryKeys.inboxList(USER)),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(notificationQueryKeys.unreadCount(USER)),
    ).toBe(2);
  });

  it("seeds a real inbox with the snapshot's age, not as fresh data", () => {
    const writtenAt = Date.now();
    writePersistedNotifications(USER, { inbox: [note("a")], unreadCount: 1 });
    const queryClient = new QueryClient();

    hydrateNotificationsFromMmkv(queryClient, USER);

    const state = queryClient.getQueryState(
      notificationQueryKeys.inboxList(USER),
    );
    expect(state?.data).toBeDefined();
    expect(state?.dataUpdatedAt).toBeGreaterThanOrEqual(writtenAt);
    expect(state?.dataUpdatedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("persistNotificationsMmkvFromQueryClient", () => {
  beforeEach(resetMockMmkv);

  it("does not write an invented empty inbox when only the badge is cached", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(notificationQueryKeys.unreadCount(USER), 3);

    persistNotificationsMmkvFromQueryClient(queryClient, USER);

    expect(hydrateNotificationsFromMmkv(new QueryClient(), USER)).toBe(false);
  });
});
