import { AxiosError } from "axios";

import { dimeApi } from "@/lib/api/dimeApi";
import {
  addPendingCardLayoutScreens,
  readPendingCardLayoutScreens,
  readPersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useToastUiStore } from "@/stores/toastUiStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { settingsQueryKeys } from "../queryKeys";
import { startCardLayoutSync, syncPendingCardLayouts } from "../sync/cardLayoutSync";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../types";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn(), patch: jest.fn() } }));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(() => Promise.resolve({ isConnected: false })) },
}));
jest.mock("@/stores/authSessionStore", () => {
  const { create } = jest.requireActual("zustand");
  return { useAuthSessionStore: create(() => ({ session: null, userId: "u1" })) };
});

const key = settingsQueryKeys.user("u1");
const dto = {
  budget_alerts_enabled: true,
  budget_monthly_alerts_enabled: true,
  budget_category_alerts_enabled: true,
  budget_monthly_warn_pct: 80,
  budget_category_warn_pct: 80,
  auto_capture_alerts_enabled: true,
  capture_failed_alerts_enabled: true,
  device_notifications_enabled: true,
  daily_expense_reminder_enabled: true,
  daily_expense_reminder_time: "20:00",
};
const httpError = (status: number) =>
  new AxiosError("x", "ERR_BAD_RESPONSE", undefined, undefined, { status } as never);
const patch = dimeApi.patch as jest.Mock;
const settle = () => new Promise((r) => setTimeout(r, 0));

function seed(cardLayouts: UserSettings["cardLayouts"]) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData<UserSettings>(key, { ...DEFAULT_USER_SETTINGS, cardLayouts });
  return queryClient;
}

beforeEach(() => {
  resetMockMmkv();
  patch.mockReset();
  useAuthSessionStore.setState({ userId: "u1" });
  useConnectivityStore.setState({ isOnline: true });
  useToastUiStore.setState(useToastUiStore.getInitialState(), true);
});

describe("syncPendingCardLayouts", () => {
  it("does nothing when nothing is pending, or nobody is signed in", async () => {
    const queryClient = seed({ home: ["home.month"] });
    await syncPendingCardLayouts(queryClient);
    addPendingCardLayoutScreens("u1", ["home"]);
    useAuthSessionStore.setState({ userId: undefined });
    await syncPendingCardLayouts(queryClient);
    expect(patch).not.toHaveBeenCalled();
  });

  it("sends the pending screens' orders (and [] for a screen with none) and clears the mark", async () => {
    const queryClient = seed({ home: ["home.stats", "home.month"] });
    addPendingCardLayoutScreens("u1", ["home", "budgets"]);
    patch.mockResolvedValue({ data: { ...dto, card_layouts: { home: ["home.stats", "home.month"] } } });
    await syncPendingCardLayouts(queryClient);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("/api/v1/me/settings", {
      card_layouts: { home: ["home.stats", "home.month"], budgets: [] },
    });
    expect(readPendingCardLayoutScreens("u1")).toEqual([]);
    expect(queryClient.getQueryData<UserSettings>(key)?.cardLayouts).toEqual({
      home: ["home.stats", "home.month"],
    });
    expect(readPersistedUserSettings("u1")?.cardLayouts).toEqual({ home: ["home.stats", "home.month"] });
  });

  it("is single-flight: calls while one runs share it", async () => {
    const queryClient = seed({ home: ["home.month"] });
    addPendingCardLayoutScreens("u1", ["home"]);
    let resolve!: (v: unknown) => void;
    patch.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = syncPendingCardLayouts(queryClient);
    const second = syncPendingCardLayouts(queryClient);
    expect(second).toBe(first);
    resolve({ data: { ...dto, card_layouts: { home: ["home.month"] } } });
    await first;
    expect(patch).toHaveBeenCalledTimes(1);
    // ...and a later one starts a new run.
    addPendingCardLayoutScreens("u1", ["home"]);
    patch.mockResolvedValue({ data: { ...dto, card_layouts: { home: ["home.month"] } } });
    await syncPendingCardLayouts(queryClient);
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("keeps the mark when the server still cannot be reached or is broken", async () => {
    const queryClient = seed({ home: ["home.month"] });
    addPendingCardLayoutScreens("u1", ["home"]);
    for (const error of [new AxiosError("Network Error", "ERR_NETWORK"), httpError(503), httpError(429)]) {
      patch.mockRejectedValueOnce(error);
      await syncPendingCardLayouts(queryClient);
      expect(readPendingCardLayoutScreens("u1")).toEqual(["home"]);
    }
    expect(useToastUiStore.getState().current).toBeNull();
    expect(queryClient.getQueryData<UserSettings>(key)?.cardLayouts).toEqual({ home: ["home.month"] });
  });

  it("a rejection drops the pending order, shows the toast and asks for the server's settings", async () => {
    const queryClient = seed({ home: ["home.month"] });
    addPendingCardLayoutScreens("u1", ["home"]);
    patch.mockRejectedValue(httpError(422));
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    await syncPendingCardLayouts(queryClient);
    expect(readPendingCardLayoutScreens("u1")).toEqual([]);
    expect(useToastUiStore.getState().current?.message).toBe("Couldn't save the new order.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
  });

  it("a screen arranged again while the send was on its way stays pending", async () => {
    const queryClient = seed({ home: ["home.month"] });
    addPendingCardLayoutScreens("u1", ["home"]);
    let resolve!: (v: unknown) => void;
    patch.mockReturnValue(new Promise((r) => (resolve = r)));
    const run = syncPendingCardLayouts(queryClient);
    queryClient.setQueryData<UserSettings>(key, {
      ...DEFAULT_USER_SETTINGS,
      cardLayouts: { home: ["home.recent"] },
    });
    resolve({ data: { ...dto, card_layouts: { home: ["home.month"] } } });
    await run;
    expect(readPendingCardLayoutScreens("u1")).toEqual(["home"]);
    expect(queryClient.getQueryData<UserSettings>(key)?.cardLayouts).toEqual({ home: ["home.recent"] });
  });

  it("waits while a settings save is running", async () => {
    const queryClient = seed({ home: ["home.month"] });
    addPendingCardLayoutScreens("u1", ["home"]);
    jest.spyOn(queryClient, "isMutating").mockReturnValue(1);
    await syncPendingCardLayouts(queryClient);
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("startCardLayoutSync", () => {
  it("syncs at a signed-in launch, on reconnect and when the app returns to the foreground", async () => {
    const queryClient = seed({ home: ["home.month"] });
    patch.mockResolvedValue({ data: { ...dto, card_layouts: { home: ["home.month"] } } });

    addPendingCardLayoutScreens("u1", ["home"]);
    const stop = startCardLayoutSync(queryClient);
    await settle();
    expect(patch).toHaveBeenCalledTimes(1);

    addPendingCardLayoutScreens("u1", ["home"]);
    useConnectivityStore.setState({ isOnline: false });
    useConnectivityStore.setState({ isOnline: true });
    await settle();
    expect(patch).toHaveBeenCalledTimes(2);

    addPendingCardLayoutScreens("u1", ["home"]);
    useAuthSessionStore.setState({ userId: undefined });
    useAuthSessionStore.setState({ userId: "u1" });
    await settle();
    expect(patch).toHaveBeenCalledTimes(3);
    stop();

    addPendingCardLayoutScreens("u1", ["home"]);
    useConnectivityStore.setState({ isOnline: false });
    useConnectivityStore.setState({ isOnline: true });
    await settle();
    expect(patch).toHaveBeenCalledTimes(3);
  });
});
