import { QueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { putPushToken } from "@/features/settings/api/pushTokenApi";
import {
  PushPermissionDeniedError,
  syncExpoPushTokenForUser,
} from "@/features/settings/utils/syncExpoPushToken";

import { prefetchSiblingTabQueries } from "../appBootstrap";

jest.mock("react-native-mmkv", () =>
  jest.requireActual("@/test-utils/mockMmkv"),
);
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn() },
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { easConfig: { projectId: "project-1" }, expoConfig: {} },
}));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: "ExponentPushToken[x]" })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve("id")),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));
jest.mock("expo-audio", () => ({
  getRecordingPermissionsAsync: jest.fn(),
  requestRecordingPermissionsAsync: jest.fn(),
}));
jest.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock("@/features/settings/api/pushTokenApi", () => ({
  putPushToken: jest.fn(() => Promise.resolve()),
  deletePushToken: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/features/settings/api/settingsApi", () => ({
  fetchUserSettings: jest.fn(() =>
    Promise.resolve({
      deviceNotificationsEnabled: true,
      dailyExpenseReminderEnabled: false,
      dailyExpenseReminderTime: "20:00",
    }),
  ),
}));
jest.mock("@/features/analytics/api/fetchMonthInsights", () => ({
  fetchMonthInsights: jest.fn(() => Promise.resolve({})),
}));
jest.mock("@/features/budgets/api/budgetsApi", () => ({
  fetchBudget: jest.fn(() => Promise.resolve({})),
}));
jest.mock("@/features/budgets/api/categoryBudgetsApi", () => ({
  fetchCategoryBudgets: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/features/categories/api/categoriesApi", () => ({
  fetchCategories: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/features/transactions/api/monthPagesQueryOptions", () => ({
  transactionsMonthPagesQueryOptions: () => ({
    queryKey: ["month-pages"],
    queryFn: () => Promise.resolve({ items: [] }),
    initialPageParam: 0,
    getNextPageParam: () => undefined,
  }),
}));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));

const permissions = Notifications.getPermissionsAsync as jest.Mock;

/** Lets the fire-and-forget notification sync in the bootstrap finish. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe("push token sync at launch never asks for permission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, "OS", "android");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("syncExpoPushTokenForUser with requestPermission: false", () => {
    it("does not show the system dialog when notifications were never answered", async () => {
      permissions.mockResolvedValue({ granted: false, status: "undetermined" });
      await expect(
        syncExpoPushTokenForUser(true, { requestPermission: false }),
      ).rejects.toBeInstanceOf(PushPermissionDeniedError);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(putPushToken).not.toHaveBeenCalled();
    });

    it("registers the token when notifications are already allowed", async () => {
      permissions.mockResolvedValue({ granted: true, status: "granted" });
      await syncExpoPushTokenForUser(true, { requestPermission: false });
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(putPushToken).toHaveBeenCalledWith("ExponentPushToken[x]");
    });

    it("still asks when the caller allows it (saving notification settings)", async () => {
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        granted: true,
        status: "granted",
      });
      await syncExpoPushTokenForUser(true);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(putPushToken).toHaveBeenCalled();
    });
  });

  describe("the launch warm-up (prefetchSiblingTabQueries)", () => {
    it("registers nothing and shows no dialog on a fresh install", async () => {
      permissions.mockResolvedValue({ granted: false, status: "undetermined" });
      prefetchSiblingTabQueries(new QueryClient(), "user-a");
      await flush();
      expect(permissions).toHaveBeenCalled();
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(putPushToken).not.toHaveBeenCalled();
    });

    it("keeps the token registered when notifications are already allowed", async () => {
      permissions.mockResolvedValue({ granted: true, status: "granted" });
      prefetchSiblingTabQueries(new QueryClient(), "user-a");
      await flush();
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
      expect(putPushToken).toHaveBeenCalledWith("ExponentPushToken[x]");
    });
  });
});
