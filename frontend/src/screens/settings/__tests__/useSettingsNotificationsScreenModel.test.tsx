import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/features/settings/types";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { useSettingsNotificationsScreenModel } from "../useSettingsNotificationsScreenModel";

const mockSaved = { value: { ...DEFAULT_USER_SETTINGS } as UserSettings };
jest.mock("@/features/settings/hooks/useUserSettingsQuery", () => ({
  useUserSettingsQuery: () => ({
    data: mockSaved.value,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
const mockMutate = jest.fn();
jest.mock("@/features/settings/hooks/useUpdateUserSettingsMutation", () => ({
  useUpdateUserSettingsMutation: () => ({ mutateAsync: mockMutate, isPending: false }),
}));
jest.mock("@/features/settings/utils/syncExpoPushToken", () => ({
  syncExpoPushTokenForUser: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/notifications/dailyExpenseReminderSchedule", () => ({
  syncDailyExpenseReminderSchedule: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/features/onboarding/utils/appPermissions", () => ({
  getAppPermissionState: jest.fn(() => Promise.resolve({ granted: true })),
}));

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function render(initial: Partial<UserSettings> = {}) {
  mockSaved.value = { ...DEFAULT_USER_SETTINGS, ...initial };
  return renderHookWithClient(createTestQueryClient(), () => useSettingsNotificationsScreenModel());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMutate.mockResolvedValue(mockSaved.value);
});

describe("Notifications settings: reminders card", () => {
  it("shows the saved reminder settings", () => {
    const { reminders } = render({
      reminderDefaultLeadDays: [7],
      reminderTime: "07:00",
      upiId: "me@okbank",
    }).current.editorProps;
    expect(reminders).toMatchObject({
      enabled: true,
      defaultLeadDays: [7],
      time: "07:00",
      overdueNudges: 2,
      upiId: "me@okbank",
      upiError: null,
    });
  });

  it("is clean until something changes, then saves only that", async () => {
    const hook = render();
    expect(hook.current.editorProps.saveDisabled).toBe(true);
    await hook.act(async () => {
      hook.current.editorProps.reminders.onHideAmountsChange(true);
      hook.current.editorProps.reminders.onOverdueNudgesChange(4);
      await settle();
    });
    expect(hook.current.editorProps.saveDisabled).toBe(false);
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({
      reminderHideAmounts: true,
      reminderOverdueNudges: 4,
    });
  });

  it("toggles default lead days (largest first, at most five, none is allowed)", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.reminders.onDefaultLeadDayToggle(7);
      await settle();
    });
    expect(hook.current.editorProps.reminders.defaultLeadDays).toEqual([7, 3, 1, 0]);
    await hook.act(async () => {
      hook.current.editorProps.reminders.onDefaultLeadDayToggle(3);
      hook.current.editorProps.reminders.onDefaultLeadDayToggle(1);
      await settle();
    });
    await hook.act(async () => {
      hook.current.editorProps.reminders.onDefaultLeadDayToggle(7);
      await settle();
    });
    await hook.act(async () => {
      hook.current.editorProps.reminders.onDefaultLeadDayToggle(0);
      await settle();
    });
    expect(hook.current.editorProps.reminders.defaultLeadDays).toEqual([]);
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({ reminderDefaultLeadDays: [] });
  });

  it("refuses to save a malformed UPI ID and says why", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.reminders.onUpiIdChange("not a upi id");
      await settle();
    });
    expect(hook.current.editorProps.reminders.upiError).toBe("Enter a UPI ID like name@bank.");
    expect(hook.current.editorProps.saveDisabled).toBe(true);
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("saves a valid UPI ID, trimmed", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.reminders.onUpiIdChange(" me@okbank ");
      await settle();
    });
    expect(hook.current.editorProps.reminders.upiError).toBeNull();
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({ upiId: "me@okbank" });
  });

  it("clearing My UPI ID saves null (the API call turns it into an empty string)", async () => {
    const hook = render({ upiId: "me@okbank" });
    await hook.act(async () => {
      hook.current.editorProps.reminders.onUpiIdChange("");
      await settle();
    });
    expect(hook.current.editorProps.reminders.upiId).toBe("");
    expect(hook.current.editorProps.reminders.upiError).toBeNull();
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({ upiId: null });
  });

  it("Clear puts the saved values back", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.reminders.onEnabledChange(false);
      await settle();
    });
    expect(hook.current.editorProps.reminders.enabled).toBe(false);
    await hook.act(async () => {
      hook.current.editorProps.onClear();
      await settle();
    });
    expect(hook.current.editorProps.reminders.enabled).toBe(true);
    expect(hook.current.editorProps.saveDisabled).toBe(true);
  });
});
