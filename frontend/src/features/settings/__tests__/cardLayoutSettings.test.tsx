import { AxiosError } from "axios";

import { dimeApi } from "@/lib/api/dimeApi";
import { readPersistedUserSettings, writePersistedUserSettings } from "@/lib/settings/userSettingsMmkv";
import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { mapDto, mapPatchToDto } from "../api/settingsApi";
import { hydrateUserSettingsFromMmkv } from "../cache/syncUserSettingsMmkv";
import { useUpdateUserSettingsMutation } from "../hooks/useUpdateUserSettingsMutation";
import { settingsQueryKeys } from "../queryKeys";
import {
  applyUserSettingsPatch,
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  type UserSettings,
} from "../types";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: { get: jest.fn(), patch: jest.fn() } }));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));

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

describe("settings DTO mapping for card layouts", () => {
  it("reads card_layouts into cardLayouts", () => {
    const settings = mapDto({ ...dto, card_layouts: { home: ["home.stats", "home.month"] } });
    expect(settings.cardLayouts).toEqual({ home: ["home.stats", "home.month"] });
  });

  it("an older server without the field, null, or junk reads as nothing saved", () => {
    expect(mapDto(dto).cardLayouts).toEqual({});
    expect(mapDto({ ...dto, card_layouts: null }).cardLayouts).toEqual({});
    expect(
      mapDto({ ...dto, card_layouts: { home: "x", nope: ["a"] } as never }).cardLayouts,
    ).toEqual({});
  });

  it("sends only the layouts that changed, with [] for a reset", () => {
    expect(mapPatchToDto({ cardLayouts: { budgets: ["budgets.recurring"] } })).toEqual({
      card_layouts: { budgets: ["budgets.recurring"] },
    });
    expect(mapPatchToDto({ cardLayouts: { home: [] } })).toEqual({ card_layouts: { home: [] } });
    expect(mapPatchToDto({ budgetAlertsEnabled: false })).toEqual({ budget_alerts_enabled: false });
  });
});

describe("user settings types", () => {
  it("defaults to no saved layouts", () => {
    expect(DEFAULT_USER_SETTINGS.cardLayouts).toEqual({});
  });

  it("normalizes a cached snapshot from before layouts existed", () => {
    const { cardLayouts: _omit, ...old } = DEFAULT_USER_SETTINGS;
    expect(normalizeUserSettings(old).cardLayouts).toEqual({});
  });

  it("applies a patch per screen, like the server", () => {
    const base: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      cardLayouts: { home: ["a"], budgets: ["b"] },
    };
    expect(applyUserSettingsPatch(base, { cardLayouts: { home: ["c"] } }).cardLayouts).toEqual({
      home: ["c"],
      budgets: ["b"],
    });
    expect(applyUserSettingsPatch(base, { cardLayouts: { home: [] } }).cardLayouts).toEqual({ budgets: ["b"] });
    expect(applyUserSettingsPatch(base, { budgetAlertsEnabled: false })).toEqual({
      ...base,
      budgetAlertsEnabled: false,
    });
  });
});

describe("hydrating the settings query from the device copy", () => {
  beforeEach(resetMockMmkv);

  it("seeds the data with the age it was saved with, so a mount refetch still happens when it is old", () => {
    const now = 1_800_000_000_000;
    const spy = jest.spyOn(Date, "now").mockReturnValue(now - 3 * 60 * 1000);
    writePersistedUserSettings("u1", { ...DEFAULT_USER_SETTINGS, cardLayouts: { home: ["home.recent"] } });
    spy.mockReturnValue(now);

    const queryClient = createTestQueryClient();
    expect(hydrateUserSettingsFromMmkv(queryClient, "u1")).toBe(true);
    const state = queryClient.getQueryState(settingsQueryKeys.user("u1"));
    expect(state?.dataUpdatedAt).toBe(now - 3 * 60 * 1000);
    expect(queryClient.getQueryData<UserSettings>(settingsQueryKeys.user("u1"))?.cardLayouts).toEqual({
      home: ["home.recent"],
    });
    // Older than the settings staleTime (60 s): a mounted observer would refetch it.
    expect(Date.now() - (state?.dataUpdatedAt ?? 0)).toBeGreaterThan(60 * 1000);
    spy.mockRestore();
  });

  it("does nothing without a snapshot or a user", () => {
    const queryClient = createTestQueryClient();
    expect(hydrateUserSettingsFromMmkv(queryClient, "u1")).toBe(false);
    expect(hydrateUserSettingsFromMmkv(queryClient, undefined)).toBe(false);
  });
});

describe("useUpdateUserSettingsMutation with card layouts", () => {
  beforeEach(resetMockMmkv);

  it("merges a layout per screen optimistically and keeps MMKV in step", async () => {
    const queryClient = createTestQueryClient();
    const key = settingsQueryKeys.user("u1");
    queryClient.setQueryData<UserSettings>(key, {
      ...DEFAULT_USER_SETTINGS,
      cardLayouts: { home: ["home.recent"], budgets: ["budgets.recurring"] },
    });
    let resolve!: (value: unknown) => void;
    (dimeApi.patch as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)));

    const hook = renderHookWithClient(queryClient, useUpdateUserSettingsMutation);
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { insights: ["insights.compare"] } });
      await Promise.resolve();
    });

    expect(queryClient.getQueryData<UserSettings>(key)?.cardLayouts).toEqual({
      home: ["home.recent"],
      budgets: ["budgets.recurring"],
      insights: ["insights.compare"],
    });
    expect(readPersistedUserSettings("u1")?.cardLayouts).toEqual({
      home: ["home.recent"],
      budgets: ["budgets.recurring"],
      insights: ["insights.compare"],
    });
    expect(dimeApi.patch).toHaveBeenCalledWith("/api/v1/me/settings", {
      card_layouts: { insights: ["insights.compare"] },
    });
    await hook.act(async () => {
      resolve({ data: { ...dto, card_layouts: { insights: ["insights.compare"] } } });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it("a reset ([]) removes only that screen's order", async () => {
    const queryClient = createTestQueryClient();
    const key = settingsQueryKeys.user("u1");
    queryClient.setQueryData<UserSettings>(key, {
      ...DEFAULT_USER_SETTINGS,
      cardLayouts: { home: ["home.recent"], budgets: ["budgets.recurring"] },
    });
    let resolve!: (value: unknown) => void;
    (dimeApi.patch as jest.Mock).mockReturnValue(new Promise((r) => (resolve = r)));
    const hook = renderHookWithClient(queryClient, useUpdateUserSettingsMutation);
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: [] } });
      await Promise.resolve();
    });
    expect(queryClient.getQueryData<UserSettings>(key)?.cardLayouts).toEqual({
      budgets: ["budgets.recurring"],
    });
    await hook.act(async () => {
      resolve({ data: { ...dto, card_layouts: { budgets: ["budgets.recurring"] } } });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it("rolls the layout back when the server rejects the save", async () => {
    const queryClient = createTestQueryClient();
    const key = settingsQueryKeys.user("u1");
    const before: UserSettings = { ...DEFAULT_USER_SETTINGS, cardLayouts: { home: ["home.recent"] } };
    queryClient.setQueryData<UserSettings>(key, before);
    (dimeApi.patch as jest.Mock).mockRejectedValue(
      new AxiosError("rejected", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 400,
      } as never),
    );
    const hook = renderHookWithClient(queryClient, useUpdateUserSettingsMutation);
    await hook.act(async () => {
      hook.current.mutate({ cardLayouts: { home: ["home.month"] } });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(queryClient.getQueryData<UserSettings>(key)).toEqual(before);
  });
});
