import { QueryClient } from "@tanstack/react-query";

import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { settingsQueryKeys } from "@/features/settings/queryKeys";
import { DEFAULT_USER_SETTINGS } from "@/features/settings/types";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import {
  readPersistedNotifications,
  writePersistedNotifications,
} from "@/lib/notifications/notificationsMmkv";
import {
  readPersistedUserSettings,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { subscribeUserTransitionWipe } from "../userTransitionWipe";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
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
  recentTransactionMutations.mark("tx-1");
}

describe("subscribeUserTransitionWipe", () => {
  let queryClient: QueryClient;
  let unsubscribe: () => void;

  beforeEach(() => {
    resetMockMmkv();
    recentTransactionMutations.clear();
    setUser("user-a");
    queryClient = new QueryClient();
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
    expect(recentTransactionMutations.isRecent("tx-1")).toBe(false);
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
