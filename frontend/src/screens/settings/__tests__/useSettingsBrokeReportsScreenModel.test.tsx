import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/features/settings/types";
import { useToastUiStore } from "@/stores/toastUiStore";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { useSettingsBrokeReportsScreenModel } from "../useSettingsBrokeReportsScreenModel";

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
const mockList = {
  value: { data: [] as unknown[], isPending: false, isError: false, fetchStatus: "idle", refetch: jest.fn() },
};
jest.mock("@/features/brokeReport/hooks/useReportsList", () => ({
  useReportsList: () => mockList.value,
}));
const mockOpenReport = jest.fn();
jest.mock("@/features/brokeReport/hooks/useOpenReport", () => ({
  useOpenReport: () => mockOpenReport,
}));

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function shown() {
  const { current, queue } = useToastUiStore.getState();
  return [current, ...queue].filter((toast) => toast !== null);
}

function render(initial: Partial<UserSettings> = {}) {
  mockSaved.value = { ...DEFAULT_USER_SETTINGS, ...initial };
  return renderHookWithClient(createTestQueryClient(), () => useSettingsBrokeReportsScreenModel());
}

beforeEach(() => {
  jest.clearAllMocks();
  useToastUiStore.setState({ current: null, queue: [] });
  mockMutate.mockResolvedValue(undefined);
  mockList.value = { data: [], isPending: false, isError: false, fetchStatus: "idle", refetch: jest.fn() };
});

describe("useSettingsBrokeReportsScreenModel", () => {
  it("shows the saved report settings, clean", () => {
    const { settingsProps } = render({ reportAlertsEnabled: false, reportRoastLevel: "savage" }).current;
    expect(settingsProps).toMatchObject({
      reportAlertsEnabled: false,
      reportRoastLevel: "savage",
      saveDisabled: true,
      clearDisabled: true,
    });
  });

  it("opens a report and the sample through the list props", () => {
    const { listProps } = render().current;
    listProps.onOpen("2026-10");
    expect(mockOpenReport).toHaveBeenCalledWith("2026-10");
    listProps.onOpenSample();
    expect(mockOpenReport).toHaveBeenLastCalledWith("sample");
  });

  it("reads a paused first load as a failure, not an endless skeleton", () => {
    mockList.value = { data: undefined as never, isPending: true, isError: false, fetchStatus: "paused", refetch: jest.fn() };
    const { listProps } = render().current;
    expect(listProps.isLoading).toBe(false);
    expect(listProps.isError).toBe(true);
  });

  it("saves the push and the roast level on their own, with a toast", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.settingsProps.onReportRoastLevelChange("gentle");
      hook.current.settingsProps.onReportAlertsChange(false);
      await settle();
    });
    expect(hook.current.settingsProps.saveDisabled).toBe(false);
    await hook.act(async () => {
      hook.current.settingsProps.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({ reportRoastLevel: "gentle", reportAlertsEnabled: false });
    expect(shown().map((toast) => toast.message)).toContain("Report settings saved");
  });

  it("reports a failed save and keeps the edit", async () => {
    mockMutate.mockRejectedValueOnce(new Error("offline"));
    const hook = render();
    await hook.act(async () => {
      hook.current.settingsProps.onReportRoastLevelChange("savage");
      await settle();
    });
    await hook.act(async () => {
      hook.current.settingsProps.onSave();
      await settle();
    });
    expect(shown().some((toast) => toast.variant === "error")).toBe(true);
    expect(hook.current.settingsProps.reportRoastLevel).toBe("savage");
  });

  it("Clear puts the saved values back", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.settingsProps.onReportAlertsChange(false);
      await settle();
    });
    await hook.act(async () => {
      hook.current.settingsProps.onClear();
      await settle();
    });
    expect(hook.current.settingsProps.reportAlertsEnabled).toBe(true);
    expect(hook.current.settingsProps.saveDisabled).toBe(true);
  });
});
