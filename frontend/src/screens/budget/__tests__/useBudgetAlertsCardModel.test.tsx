import { DEFAULT_USER_SETTINGS, type UserSettings } from "@/features/settings/types";
import { useToastUiStore } from "@/stores/toastUiStore";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { useBudgetAlertsCardModel } from "../useBudgetAlertsCardModel";

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

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function shown() {
  const { current, queue } = useToastUiStore.getState();
  return [current, ...queue].filter((toast) => toast !== null);
}

function render(initial: Partial<UserSettings> = {}) {
  mockSaved.value = { ...DEFAULT_USER_SETTINGS, ...initial };
  return renderHookWithClient(createTestQueryClient(), () => useBudgetAlertsCardModel());
}

beforeEach(() => {
  jest.clearAllMocks();
  useToastUiStore.setState({ current: null, queue: [] });
  mockMutate.mockResolvedValue(undefined);
});

describe("useBudgetAlertsCardModel", () => {
  it("shows the saved alert settings and is clean", () => {
    const model = render({ budgetMonthlyWarnPct: 70, budgetCategoryAlertsEnabled: false }).current;
    expect(model).toMatchObject({
      budgetMonthlyAlertsEnabled: true,
      budgetMonthlyWarnPct: 70,
      budgetCategoryAlertsEnabled: false,
      budgetCategoryWarnPct: 80,
      saveDisabled: true,
      clearDisabled: true,
    });
  });

  it("saves only the alert settings that changed, with a toast", async () => {
    const hook = render();
    await hook.act(async () => {
      hook.current.onBudgetMonthlyWarnPctChange(60);
      hook.current.onBudgetCategoryAlertsChange(false);
      await settle();
    });
    expect(hook.current.saveDisabled).toBe(false);
    await hook.act(async () => {
      hook.current.onSave();
      await settle();
    });
    expect(mockMutate).toHaveBeenCalledWith({
      budgetMonthlyWarnPct: 60,
      budgetCategoryAlertsEnabled: false,
    });
    expect(shown().map((toast) => toast.message)).toContain("Budget alerts saved");
  });

  it("reports a failed save and keeps the edit", async () => {
    mockMutate.mockRejectedValueOnce(new Error("offline"));
    const hook = render();
    await hook.act(async () => {
      hook.current.onBudgetMonthlyAlertsChange(false);
      await settle();
    });
    await hook.act(async () => {
      hook.current.onSave();
      await settle();
    });
    expect(shown().some((toast) => toast.variant === "error")).toBe(true);
    expect(hook.current.budgetMonthlyAlertsEnabled).toBe(false);
    expect(hook.current.saveDisabled).toBe(false);
  });

  it("Clear puts the saved values back and bumps the sync key for the Custom % fields", async () => {
    const hook = render();
    const before = hook.current.syncKey;
    await hook.act(async () => {
      hook.current.onBudgetCategoryWarnPctChange(55);
      await settle();
    });
    expect(hook.current.budgetCategoryWarnPct).toBe(55);
    await hook.act(async () => {
      hook.current.onClear();
      await settle();
    });
    expect(hook.current.budgetCategoryWarnPct).toBe(80);
    expect(hook.current.saveDisabled).toBe(true);
    expect(hook.current.syncKey).toBe(before + 1);
  });
});
