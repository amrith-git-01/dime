import { AxiosError } from "axios";

import { dimeApi } from "@/lib/api/dimeApi";
import {
  addPendingCardLayoutScreens,
  readPendingCardLayoutScreens,
  readPersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";
import { bumpUserDataEpoch } from "@/lib/userDataEpoch";
import { useToastUiStore } from "@/stores/toastUiStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import {
  CARD_ORDER_SAVE_FAILED_MESSAGE,
  useUpdateUserSettingsMutation,
} from "../hooks/useUpdateUserSettingsMutation";
import { settingsQueryKeys } from "../queryKeys";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../types";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn(), patch: jest.fn() } }));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));

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
const networkError = () => new AxiosError("Network Error", "ERR_NETWORK");

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
function deferredPatches(): Deferred[] {
  const calls: Deferred[] = [];
  (dimeApi.patch as jest.Mock).mockImplementation(
    () => new Promise((resolve, reject) => calls.push({ resolve, reject })),
  );
  return calls;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(initial: Partial<UserSettings> = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData<UserSettings>(key, {
    ...DEFAULT_USER_SETTINGS,
    cardLayouts: { home: ["home.recent"] },
    ...initial,
  });
  const hook = renderHookWithClient(queryClient, useUpdateUserSettingsMutation);
  return { queryClient, hook };
}
const data = (queryClient: ReturnType<typeof createTestQueryClient>) =>
  queryClient.getQueryData<UserSettings>(key) as UserSettings;

beforeEach(() => {
  resetMockMmkv();
  (dimeApi.patch as jest.Mock).mockReset();
  useToastUiStore.setState(useToastUiStore.getInitialState(), true);
});

describe("a card order save that fails for a passing reason", () => {
  it.each([
    ["offline", networkError()],
    ["a 503", httpError(503)],
    ["a 500", httpError(500)],
    ["a 429", httpError(429)],
  ])("keeps the new order and marks the screen pending (%s)", async (_name, error) => {
    const { queryClient, hook } = setup();
    deferredPatches();
    (dimeApi.patch as jest.Mock).mockRejectedValue(error);
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: ["home.month"] } });
      await settle();
    });
    expect(data(queryClient).cardLayouts).toEqual({ home: ["home.month"] });
    expect(readPersistedUserSettings("u1")?.cardLayouts).toEqual({ home: ["home.month"] });
    expect(readPendingCardLayoutScreens("u1")).toEqual(["home"]);
    expect(useToastUiStore.getState().current).toBeNull();
  });

  it("a scalar in the same patch is still put back", async () => {
    const { queryClient, hook } = setup();
    (dimeApi.patch as jest.Mock).mockRejectedValue(networkError());
    await hook.act(async () => {
      hook.current.mutate({ weeklyEmailEnabled: false, cardLayouts: { home: ["home.month"] } });
      await settle();
    });
    expect(data(queryClient).weeklyEmailEnabled).toBe(true);
    expect(data(queryClient).cardLayouts).toEqual({ home: ["home.month"] });
  });

  it("a later successful save of that screen clears its pending mark", async () => {
    const { hook } = setup();
    addPendingCardLayoutScreens("u1", ["home", "budgets"]);
    (dimeApi.patch as jest.Mock).mockResolvedValue({ data: { ...dto, card_layouts: { home: ["home.month"] } } });
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: ["home.month"] } });
      await settle();
    });
    expect(readPendingCardLayoutScreens("u1")).toEqual(["budgets"]);
  });

  it("a server answer does not undo an order that is still pending", async () => {
    const { queryClient, hook } = setup();
    // Home's order is on this device only; the server knows nothing about it.
    queryClient.setQueryData<UserSettings>(key, { ...data(queryClient), cardLayouts: { home: ["home.month"] } });
    addPendingCardLayoutScreens("u1", ["home"]);
    (dimeApi.patch as jest.Mock).mockResolvedValue({ data: { ...dto, weekly_email_enabled: false } });
    await hook.act(async () => {
      hook.current.mutate({ weeklyEmailEnabled: false });
      await settle();
    });
    expect(data(queryClient).weeklyEmailEnabled).toBe(false);
    expect(data(queryClient).cardLayouts).toEqual({ home: ["home.month"] });
  });
});

describe("a card order save the server rejects", () => {
  it.each([400, 403, 404, 422])("rolls that screen back at once and shows a toast (%s)", async (status) => {
    const { queryClient, hook } = setup({ cardLayouts: { home: ["home.recent"], budgets: ["budgets.recurring"] } });
    (dimeApi.patch as jest.Mock).mockRejectedValue(httpError(status));
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: ["home.month"] } });
      await settle();
    });
    expect(data(queryClient).cardLayouts).toEqual({
      home: ["home.recent"],
      budgets: ["budgets.recurring"],
    });
    expect(readPersistedUserSettings("u1")?.cardLayouts.home).toEqual(["home.recent"]);
    expect(readPendingCardLayoutScreens("u1")).toEqual([]);
    const toast = useToastUiStore.getState().current;
    expect(toast?.message).toBe(CARD_ORDER_SAVE_FAILED_MESSAGE);
    expect(toast?.message).toBe("Couldn't save the new order.");
    expect(toast?.variant).toBe("error");
  });
});

describe("concurrent settings saves", () => {
  it("Done in flight + an email toggle: the order save fails, the toggle survives", async () => {
    const { queryClient, hook } = setup();
    const calls = deferredPatches();
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: ["home.month"] } }); // A
      await Promise.resolve();
    });
    await hook.act(async () => {
      hook.current.mutate({ weeklyEmailEnabled: false }); // B
      await Promise.resolve();
    });
    expect(calls).toHaveLength(2);
    expect(data(queryClient).weeklyEmailEnabled).toBe(false);

    await hook.act(async () => {
      calls[0].reject(httpError(422));
      await settle();
    });
    // A is rolled back, B's optimistic toggle is still there.
    expect(data(queryClient).cardLayouts).toEqual({ home: ["home.recent"] });
    expect(data(queryClient).weeklyEmailEnabled).toBe(false);

    await hook.act(async () => {
      calls[1].resolve({
        data: { ...dto, weekly_email_enabled: false, card_layouts: { home: ["home.recent"] } },
      });
      await settle();
    });
    expect(data(queryClient).weeklyEmailEnabled).toBe(false);
    expect(data(queryClient).cardLayouts).toEqual({ home: ["home.recent"] });
  });

  it("a failed toggle does not take another save's change with it", async () => {
    const { queryClient, hook } = setup();
    const calls = deferredPatches();
    await hook.act(async () => {
      hook.current.mutate({ weeklyEmailEnabled: false }); // A
      await Promise.resolve();
    });
    await hook.act(async () => {
      hook.current.mutate({ monthlyEmailEnabled: false }); // B
      await Promise.resolve();
    });
    await hook.act(async () => {
      calls[0].reject(networkError());
      await settle();
    });
    expect(data(queryClient).weeklyEmailEnabled).toBe(true);
    expect(data(queryClient).monthlyEmailEnabled).toBe(false);
  });

  it("an answer that lands while another save runs does not overwrite the cache", async () => {
    const { queryClient, hook } = setup();
    const calls = deferredPatches();
    await hook.act(async () => {
      hook.current.mutate({ weeklyEmailEnabled: false }); // A
      await Promise.resolve();
    });
    await hook.act(async () => {
      hook.current.mutate({ monthlyEmailEnabled: false }); // B
      await Promise.resolve();
    });
    // A's answer was computed before B reached the server: it still says monthly is on.
    await hook.act(async () => {
      calls[0].resolve({ data: { ...dto, weekly_email_enabled: false, monthly_email_enabled: true } });
      await settle();
    });
    expect(data(queryClient).monthlyEmailEnabled).toBe(false);
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    // The last answer settles the cache.
    await hook.act(async () => {
      calls[1].resolve({ data: { ...dto, weekly_email_enabled: false, monthly_email_enabled: false } });
      await settle();
    });
    expect(data(queryClient).monthlyEmailEnabled).toBe(false);
    expect(data(queryClient).weeklyEmailEnabled).toBe(false);
  });

  it("a failure after the user signed out or switched touches nothing", async () => {
    const { queryClient, hook } = setup();
    const calls = deferredPatches();
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: ["home.month"] } });
      await Promise.resolve();
    });
    bumpUserDataEpoch();
    await hook.act(async () => {
      calls[0].reject(networkError());
      await settle();
    });
    expect(readPendingCardLayoutScreens("u1")).toEqual([]);
    expect(data(queryClient).cardLayouts).toEqual({ home: ["home.month"] });
  });
});
