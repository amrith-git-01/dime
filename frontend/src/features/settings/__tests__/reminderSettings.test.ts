import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { mapDto, mapPatchToDto } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";
import {
  applyUserSettingsPatch,
  DEFAULT_USER_SETTINGS,
  normalizeUserSettings,
  sanitizeReminderLeadDays,
  type UserSettings,
} from "../types";
import { buildSettingsPatch, settingsEqual } from "../utils/settingsDraft";
import {
  resetDeviceTimezoneAttempts,
  syncDeviceTimezone,
} from "../utils/syncDeviceTimezone";

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { get: jest.fn(), patch: jest.fn() },
}));

const mockTimezone = { value: "Asia/Kolkata" };
jest.mock("@/utils/deviceTimezone", () => ({
  getDeviceIanaTimezone: () => mockTimezone.value,
}));

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

describe("reminder settings: defaults", () => {
  it("are on, with 3, 1 and 0 days at 9 am, two nudges, quiet hours off", () => {
    expect(DEFAULT_USER_SETTINGS).toMatchObject({
      remindersEnabled: true,
      reminderDefaultLeadDays: [3, 1, 0],
      reminderTime: "09:00",
      reminderOverdueNudges: 2,
      reminderQuietEnabled: false,
      reminderQuietStart: "22:00",
      reminderQuietEnd: "08:00",
      reminderHideAmounts: false,
      upiId: null,
      timezone: null,
    });
  });
});

describe("reminder settings: reading from the server", () => {
  it("maps every snake_case field", () => {
    const settings = mapDto({
      ...dto,
      reminders_enabled: false,
      reminder_default_lead_days: [7, 2],
      reminder_time: "07:45",
      reminder_overdue_nudges: 5,
      reminder_quiet_enabled: true,
      reminder_quiet_start: "23:00",
      reminder_quiet_end: "06:30",
      reminder_hide_amounts: true,
      upi_id: "me@okbank",
      timezone: "Asia/Kolkata",
    });
    expect(settings).toMatchObject({
      remindersEnabled: false,
      reminderDefaultLeadDays: [7, 2],
      reminderTime: "07:45",
      reminderOverdueNudges: 5,
      reminderQuietEnabled: true,
      reminderQuietStart: "23:00",
      reminderQuietEnd: "06:30",
      reminderHideAmounts: true,
      upiId: "me@okbank",
      timezone: "Asia/Kolkata",
    });
  });

  it("an older server without the fields reads as the defaults", () => {
    const settings = mapDto(dto);
    expect(settings).toMatchObject({
      remindersEnabled: true,
      reminderDefaultLeadDays: [3, 1, 0],
      reminderTime: "09:00",
      reminderOverdueNudges: 2,
      reminderQuietEnabled: false,
      reminderQuietStart: "22:00",
      reminderQuietEnd: "08:00",
      reminderHideAmounts: false,
      upiId: null,
      timezone: null,
    });
  });

  it("keeps an empty default list (the user wants no default days)", () => {
    expect(mapDto({ ...dto, reminder_default_lead_days: [] }).reminderDefaultLeadDays).toEqual([]);
  });

  it("repairs malformed values instead of trusting them", () => {
    const settings = normalizeUserSettings({
      remindersEnabled: "yes" as never,
      reminderDefaultLeadDays: [3, 3, 99, -1, 1.5, "2" as never, 0],
      reminderTime: "9am",
      reminderOverdueNudges: 9,
      reminderQuietEnabled: 1 as never,
      reminderQuietStart: "25:00",
      reminderQuietEnd: "",
      reminderHideAmounts: null as never,
      upiId: "   ",
      timezone: "",
    });
    expect(settings).toMatchObject({
      remindersEnabled: true,
      reminderDefaultLeadDays: [3, 0],
      reminderTime: "09:00",
      reminderOverdueNudges: 2,
      reminderQuietEnabled: false,
      reminderQuietStart: "22:00",
      reminderQuietEnd: "08:00",
      reminderHideAmounts: false,
      upiId: null,
      timezone: null,
    });
  });

  it("normalizes a cached snapshot from before the fields existed", () => {
    const old: Record<string, unknown> = { ...DEFAULT_USER_SETTINGS };
    for (const key of [
      "remindersEnabled",
      "reminderDefaultLeadDays",
      "reminderTime",
      "reminderOverdueNudges",
      "reminderQuietEnabled",
      "reminderQuietStart",
      "reminderQuietEnd",
      "reminderHideAmounts",
      "upiId",
      "timezone",
    ]) {
      delete old[key];
    }
    expect(normalizeUserSettings(old as Partial<UserSettings>)).toEqual(DEFAULT_USER_SETTINGS);
  });

  it("limits the default list to five entries within 0 to 27", () => {
    expect(sanitizeReminderLeadDays([27, 28, 5, 4, 3, 2, 1, 0])).toEqual([27, 5, 4, 3, 2]);
    expect(sanitizeReminderLeadDays("3,1")).toEqual([3, 1, 0]);
  });
});

describe("reminder settings: writing to the server", () => {
  it("sends only the changed fields, snake_case", () => {
    expect(mapPatchToDto({ remindersEnabled: false })).toEqual({ reminders_enabled: false });
    expect(
      mapPatchToDto({
        reminderDefaultLeadDays: [5, 1],
        reminderTime: "08:00",
        reminderOverdueNudges: 0,
        reminderQuietEnabled: true,
        reminderQuietStart: "21:30",
        reminderQuietEnd: "07:00",
        reminderHideAmounts: true,
      }),
    ).toEqual({
      reminder_default_lead_days: [5, 1],
      reminder_time: "08:00",
      reminder_overdue_nudges: 0,
      reminder_quiet_enabled: true,
      reminder_quiet_start: "21:30",
      reminder_quiet_end: "07:00",
      reminder_hide_amounts: true,
    });
  });

  it("sends an empty default list as an empty list, not as nothing", () => {
    expect(mapPatchToDto({ reminderDefaultLeadDays: [] })).toEqual({
      reminder_default_lead_days: [],
    });
  });

  it("sets and clears My UPI ID (null in a PATCH means unchanged, so a clear is an empty string)", () => {
    expect(mapPatchToDto({ upiId: "me@okbank" })).toEqual({ upi_id: "me@okbank" });
    expect(mapPatchToDto({ upiId: null })).toEqual({ upi_id: "" });
    expect(mapPatchToDto({})).toEqual({});
  });

  it("sends the timezone only when there is one", () => {
    expect(mapPatchToDto({ timezone: "Asia/Kolkata" })).toEqual({ timezone: "Asia/Kolkata" });
    expect(mapPatchToDto({ timezone: null })).toEqual({});
  });

  it("applies a reminder patch optimistically", () => {
    const next = applyUserSettingsPatch(DEFAULT_USER_SETTINGS, {
      remindersEnabled: false,
      upiId: "me@okbank",
    });
    expect(next.remindersEnabled).toBe(false);
    expect(next.upiId).toBe("me@okbank");
    expect(applyUserSettingsPatch(next, { upiId: null }).upiId).toBeNull();
  });
});

describe("reminder settings: draft diffing", () => {
  const saved = DEFAULT_USER_SETTINGS;

  it("sees every reminder field change", () => {
    const changes: Partial<UserSettings>[] = [
      { remindersEnabled: false },
      { reminderDefaultLeadDays: [3, 1] },
      { reminderDefaultLeadDays: [] },
      { reminderTime: "10:00" },
      { reminderOverdueNudges: 3 },
      { reminderQuietEnabled: true },
      { reminderQuietStart: "23:00" },
      { reminderQuietEnd: "09:00" },
      { reminderHideAmounts: true },
      { upiId: "me@okbank" },
    ];
    for (const change of changes) {
      expect(settingsEqual(saved, { ...saved, ...change })).toBe(false);
      expect(buildSettingsPatch(saved, { ...saved, ...change })).toEqual(change);
    }
    expect(settingsEqual(saved, { ...saved, reminderDefaultLeadDays: [3, 1, 0] })).toBe(true);
    expect(buildSettingsPatch(saved, { ...saved, reminderDefaultLeadDays: [3, 1, 0] })).toBeNull();
  });

  it("treats a reordered default list as a change (the order is the user's)", () => {
    expect(settingsEqual(saved, { ...saved, reminderDefaultLeadDays: [0, 1, 3] })).toBe(false);
  });

  it("leaves the timezone to the launch sync", () => {
    expect(settingsEqual(saved, { ...saved, timezone: "Asia/Kolkata" })).toBe(true);
    expect(buildSettingsPatch(saved, { ...saved, timezone: "Asia/Kolkata" })).toBeNull();
  });

  it("clearing My UPI ID is a change to null", () => {
    const withUpi = { ...saved, upiId: "me@okbank" };
    expect(buildSettingsPatch(withUpi, { ...withUpi, upiId: null })).toEqual({ upiId: null });
  });
});

describe("syncDeviceTimezone (at launch)", () => {
  const patch = jest.mocked(
    jest.requireMock("@/lib/api/dimeApi").dimeApi.patch as jest.Mock,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    resetDeviceTimezoneAttempts();
    mockTimezone.value = "Asia/Kolkata";
    patch.mockResolvedValue({ data: {} });
  });

  it("tells the server when the device is somewhere else", async () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(settingsQueryKeys.user("u1"), {
      ...DEFAULT_USER_SETTINGS,
      timezone: "UTC",
    });
    await syncDeviceTimezone(queryClient, "u1", { timezone: "UTC" });
    expect(patch).toHaveBeenCalledWith("/api/v1/me/settings", { timezone: "Asia/Kolkata" });
    expect(
      queryClient.getQueryData<UserSettings>(settingsQueryKeys.user("u1"))?.timezone,
    ).toBe("Asia/Kolkata");
  });

  it("sets it the first time (the server has none)", async () => {
    await syncDeviceTimezone(createTestQueryClient(), "u1", { timezone: null });
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the server already has it", async () => {
    await syncDeviceTimezone(createTestQueryClient(), "u1", { timezone: "Asia/Kolkata" });
    expect(patch).not.toHaveBeenCalled();
  });

  it("swallows a failure and does not hammer the server within a session", async () => {
    patch.mockRejectedValue(new Error("422"));
    const queryClient = createTestQueryClient();
    await expect(
      syncDeviceTimezone(queryClient, "u1", { timezone: null }),
    ).resolves.toBeUndefined();
    await syncDeviceTimezone(queryClient, "u1", { timezone: null });
    expect(patch).toHaveBeenCalledTimes(1);
    // A different timezone is a new fact worth trying.
    mockTimezone.value = "Asia/Dubai";
    await syncDeviceTimezone(queryClient, "u1", { timezone: null });
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("never throws, even when the settings client is broken", async () => {
    patch.mockImplementation(() => {
      throw new Error("boom");
    });
    await expect(
      syncDeviceTimezone(createTestQueryClient(), "u2", { timezone: null }),
    ).resolves.toBeUndefined();
  });
});
