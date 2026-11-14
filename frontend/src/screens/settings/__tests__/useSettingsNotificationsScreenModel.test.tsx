import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/features/settings/types";
import { useToastUiStore } from "@/stores/toastUiStore";
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
const mockSyncToken = jest.fn((_enabled: boolean) => Promise.resolve());
jest.mock("@/features/settings/utils/syncExpoPushToken", () => ({
  syncExpoPushTokenForUser: (enabled: boolean) => mockSyncToken(enabled),
}));
const mockSyncSchedule = jest.fn((_args: unknown) => Promise.resolve());
jest.mock("@/lib/notifications/dailyExpenseReminderSchedule", () => ({
  syncDailyExpenseReminderSchedule: (args: unknown) => mockSyncSchedule(args),
}));
jest.mock("@/features/onboarding/utils/appPermissions", () => ({
  getAppPermissionState: jest.fn(() => Promise.resolve({ granted: true })),
}));

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function shown() {
  const { current, queue } = useToastUiStore.getState();
  return [current, ...queue].filter((toast) => toast !== null);
}

function render(initial: Partial<UserSettings> = {}) {
  mockSaved.value = { ...DEFAULT_USER_SETTINGS, ...initial };
  return renderHookWithClient(createTestQueryClient(), () => useSettingsNotificationsScreenModel());
}

beforeEach(() => {
  jest.clearAllMocks();
  useToastUiStore.setState({ current: null, queue: [] });
  mockMutate.mockResolvedValue(mockSaved.value);
});

describe("Notifications settings screen", () => {
  it("shows the saved device, daily reminder and capture settings, and is clean", () => {
    const { editorProps } = render({
      deviceNotificationsEnabled: false,
      dailyExpenseReminderTime: "21:30",
      captureFailedAlertsEnabled: false,
    }).current;
    expect(editorProps).toMatchObject({
      deviceNotificationsEnabled: false,
      dailyExpenseReminderEnabled: true,
      dailyExpenseReminderTime: "21:30",
      autoCaptureAlertsEnabled: true,
      captureFailedAlertsEnabled: false,
      saveDisabled: true,
      clearDisabled: true,
    });
  });

  it("no longer carries the budget, report or reminder settings", () => {
    const keys = Object.keys(render().current.editorProps);
    expect(keys).not.toContain("reminders");
    expect(keys).not.toContain("budgetMonthlyAlertsEnabled");
    expect(keys).not.toContain("reportRoastLevel");
  });

  it("saves only what changed, then syncs the push token and the daily schedule", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.onDailyExpenseReminderTimeChange("21:00");
      hook.current.editorProps.onCaptureFailedAlertsChange(false);
      await settle();
    });
    expect(hook.current.editorProps.saveDisabled).toBe(false);
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({
      dailyExpenseReminderTime: "21:00",
      captureFailedAlertsEnabled: false,
    });
    expect(mockSyncToken).toHaveBeenCalledWith(true);
    expect(mockSyncSchedule).toHaveBeenCalledWith({
      enabled: true,
      time: "21:00",
      deviceNotificationsEnabled: true,
    });
    expect(shown().map((toast) => toast.message)).toContain("Notification settings saved");
  });

  it("does not save, or sync anything, when nothing changed", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockSyncToken).not.toHaveBeenCalled();
    expect(mockSyncSchedule).not.toHaveBeenCalled();
  });

  it("warns, but keeps the saved settings, when the push token cannot be synced", async () => {
    mockSyncToken.mockRejectedValueOnce(new Error("no permission"));
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.onAutoCaptureAlertsChange(false);
      await settle();
    });
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    const messages = shown().map((toast) => toast.message);
    expect(messages).toContain("Notification settings saved");
    expect(messages.some((m) => m.startsWith("Device notifications may not work"))).toBe(true);
  });

  it("reports a failed save and keeps the edit", async () => {
    mockMutate.mockRejectedValueOnce(new Error("offline"));
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.onDeviceNotificationsChange(false);
      await settle();
    });
    await hook.act(async () => {
      hook.current.editorProps.onSave();
      await settle();
    });
    expect(shown().some((toast) => toast.variant === "error")).toBe(true);
    expect(hook.current.editorProps.deviceNotificationsEnabled).toBe(false);
    expect(hook.current.editorProps.saveDisabled).toBe(false);
    expect(mockSyncToken).not.toHaveBeenCalled();
  });

  it("Clear puts the saved values back", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.editorProps.onDeviceNotificationsChange(false);
      await settle();
    });
    expect(hook.current.editorProps.deviceNotificationsEnabled).toBe(false);
    await hook.act(async () => {
      hook.current.editorProps.onClear();
      await settle();
    });
    expect(hook.current.editorProps.deviceNotificationsEnabled).toBe(true);
    expect(hook.current.editorProps.saveDisabled).toBe(true);
  });
});
