import { QueryClient } from "@tanstack/react-query";
import { deleteAsync } from "expo-file-system/legacy";

import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { DEFAULT_USER_SETTINGS } from "@/features/settings/types";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";
import { getAppliedCardOrder, setAppliedCardOrder } from "@/features/cardLayout/appliedOrder";
import {
  addPendingCardLayoutScreens,
  readPendingCardLayoutScreens,
  readPersistedUserSettings,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import {
  addPendingCaptureJob,
  readPendingCaptureJobs,
  readWidgetCaptureStatus,
  writeWidgetCaptureStatus,
} from "@/lib/widgets/widgetCaptureMmkv";
import {
  readWidgetSnapshot,
  writeWidgetSnapshot,
} from "@/lib/widgets/widgetSnapshotMmkv";
import { etagCache } from "@/lib/api/etagCache";
import { loadOutboxItems, saveOutboxItems } from "@/lib/outbox/outboxStorage";
import { manualItem } from "@/lib/outbox/__tests__/fixtures";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useOutboxStore } from "@/stores/outboxStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { subscribeUserTransitionWipe } from "../userTransitionWipe";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/stores/authSessionStore", () => {
  const { create } = jest.requireActual("zustand");
  return {
    useAuthSessionStore: create(() => ({ session: null, userId: undefined })),
  };
});

function setUser(userId: string | undefined): void {
  useAuthSessionStore.setState({ userId });
}

function seedUserData(queryClient: QueryClient, userId: string): void {
  queryClient.setQueryData(
    settingsQueryKeys.user(userId),
    DEFAULT_USER_SETTINGS,
  );
  queryClient.setQueryData(notificationQueryKeys.unreadCount(userId), 3);
  writePersistedNotifications(userId, { inbox: [], unreadCount: 3 });
  writePersistedUserSettings(userId, DEFAULT_USER_SETTINGS);
  // The order Home shows and an arranged order that never reached the server.
  setAppliedCardOrder("home", ["home.recent", "home.month"]);
  addPendingCardLayoutScreens(userId, ["home"]);
  recentTransactionMutations.mark("tx-1");
  writeWidgetSnapshot({
    userId,
    updatedAt: 1,
    monthKey: "2026-10",
    spentThisMonth: 100,
    recurringSpent: 0,
    flexibleSpent: 100,
    monthlyBudget: null,
    budgetLeft: null,
    topCategories: [],
  });
  writeWidgetCaptureStatus({
    kind: "reading",
    text: "Reading receipt…",
    at: Date.now(),
    userId,
    jobId: "job-1",
  });
  addPendingCaptureJob({ id: "job-1", userId, at: Date.now() });
  // Writes that never reached the server, and the remembered ETags of the user's data.
  saveOutboxItems(userId, [manualItem()]);
  useOutboxStore.getState().reset();
  useOutboxStore.getState().hydrate(userId);
  etagCache.set(`https://api.test/api/v1/transactions/home?timezone=UTC&u=${userId}`, { etag: "W/\"1\"", data: {} });
}

describe("subscribeUserTransitionWipe", () => {
  let queryClient: QueryClient;
  let unsubscribe: () => void;

  beforeEach(() => {
    resetMockMmkv();
    jest.mocked(deleteAsync).mockClear();
    etagCache.clear();
    recentTransactionMutations.clear();
    setUser("user-a");
    queryClient = createTestQueryClient();
    unsubscribe = subscribeUserTransitionWipe(queryClient);
    seedUserData(queryClient, "user-a");
  });

  afterEach(() => {
    unsubscribe();
    queryClient.clear();
  });

  function expectWiped(): void {
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(readPersistedNotifications("user-a")).toBeNull();
    expect(readPersistedUserSettings("user-a")).toBeNull();
    // Tours must not walk the previous user's card order, and nothing pending goes to the next account.
    expect(getAppliedCardOrder("home")).toBeUndefined();
    expect(readPendingCardLayoutScreens("user-a")).toEqual([]);
    expect(recentTransactionMutations.isRecent("tx-1")).toBe(false);
    expect(readWidgetSnapshot()).toBeNull();
    // The old account's capture status and waiting jobs must not reach the next one.
    expect(readWidgetCaptureStatus()).toBeNull();
    expect(readPendingCaptureJobs()).toEqual([]);
    // The outbox (disk and memory), its saved files and the ETags go with the account.
    expect(loadOutboxItems("user-a")).toEqual([]);
    expect(useOutboxStore.getState().items).toEqual([]);
    expect(useOutboxStore.getState().userId).toBeNull();
    expect(etagCache.size).toBe(0);
    expect(deleteAsync).toHaveBeenCalledWith("file:///docs/outbox/", { idempotent: true });
  }

  it("wipes when the user disappears (session revoked or expired)", () => {
    setUser(undefined);
    expectWiped();
  });

  it("wipes when the user switches from A to B", () => {
    setUser("user-b");
    expectWiped();
  });

  it("keeps everything on sign-in from a signed-out state", () => {
    setUser(undefined);
    seedUserData(queryClient, "user-b");
    setUser("user-b");
    expect(
      queryClient.getQueryData(notificationQueryKeys.unreadCount("user-b")),
    ).toBe(3);
    expect(readPersistedNotifications("user-b")).not.toBeNull();
  });

  it("keeps everything on a session update for the same user (token refresh)", () => {
    useAuthSessionStore.setState({ session: null, userId: "user-a" });
    expect(
      queryClient.getQueryData(notificationQueryKeys.unreadCount("user-a")),
    ).toBe(3);
    expect(readPersistedUserSettings("user-a")).not.toBeNull();
  });

  it("stops wiping after unsubscribe", () => {
    unsubscribe();
    setUser(undefined);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
  });
});
