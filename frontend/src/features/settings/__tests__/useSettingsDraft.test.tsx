import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { DEFAULT_USER_SETTINGS, type UserSettings } from "../types";

// A tiny settings store the mocked query reads, so a test can change the saved settings from
// "another screen" and have the hook re-render.
const mockStore = {
  value: { ...DEFAULT_USER_SETTINGS } as UserSettings,
  listeners: new Set<() => void>(),
  set(next: UserSettings) {
    mockStore.value = next;
    mockStore.listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    mockStore.listeners.add(listener);
    return () => {
      mockStore.listeners.delete(listener);
    };
  },
};
jest.mock("../hooks/useUserSettingsQuery", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- inside the mock factory
  const { useSyncExternalStore } = require("react") as typeof import("react");
  return {
    useUserSettingsQuery: () => ({
      data: useSyncExternalStore(
        (listener: () => void) => mockStore.subscribe(listener),
        () => mockStore.value,
      ),
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    }),
  };
});
const mockMutate = jest.fn();
jest.mock("../hooks/useUpdateUserSettingsMutation", () => ({
  useUpdateUserSettingsMutation: () => ({ mutateAsync: mockMutate, isPending: false }),
}));

const REPORT_KEYS = ["reportAlertsEnabled", "reportRoastLevel"] as const;
const REMINDER_KEYS = ["reminderTime", "reminderDefaultLeadDays"] as const;

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function renderReport() {
  return renderHookWithClient(createTestQueryClient(), () => useSettingsDraft(REPORT_KEYS));
}

function renderReminder() {
  return renderHookWithClient(createTestQueryClient(), () => useSettingsDraft(REMINDER_KEYS));
}

/** Another screen's save lands: the saved settings change under the hook. */
async function savedElsewhere(
  hook: { act: (callback: () => Promise<void>) => unknown },
  change: Partial<UserSettings>,
) {
  await hook.act(async () => {
    mockStore.set({ ...mockStore.value, ...change });
    await settle();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.value = { ...DEFAULT_USER_SETTINGS };
  mockMutate.mockResolvedValue(undefined);
});

describe("useSettingsDraft", () => {
  it("starts as the saved settings and clean", () => {
    const hook = renderReport();
    expect(hook.current.draft).toEqual(DEFAULT_USER_SETTINGS);
    expect(hook.current.isDirty).toBe(false);
    expect(hook.current.isReady).toBe(true);
  });

  it("is dirty after an edit to its own slice, and clean again when the edit is undone", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    expect(hook.current.draft.reportRoastLevel).toBe("savage");
    expect(hook.current.isDirty).toBe(true);
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "spicy" });
      await settle();
    });
    expect(hook.current.isDirty).toBe(false);
  });

  it("saves only the keys of its own slice", async () => {
    const hook = renderReport();
    await savedElsewhere(hook, { reminderTime: "10:00" });
    await hook.act(async () => {
      hook.current.patchDraft({ reportAlertsEnabled: false, reportRoastLevel: "gentle" });
      await settle();
    });
    let sent: UserSettings | null = null;
    await hook.act(async () => {
      sent = await hook.current.save();
    });
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ reportAlertsEnabled: false, reportRoastLevel: "gentle" });
    expect(sent).toMatchObject({ reportRoastLevel: "gentle", reminderTime: "10:00" });
  });

  it("sends only what changed within the slice", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    await hook.act(async () => {
      await hook.current.save();
    });
    expect(mockMutate).toHaveBeenCalledWith({ reportRoastLevel: "savage" });
  });

  it("lets the caller adjust the patch before it is sent", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    await hook.act(async () => {
      await hook.current.save((patch) => ({ ...patch, reportAlertsEnabled: true }));
    });
    expect(mockMutate).toHaveBeenCalledWith({ reportRoastLevel: "savage", reportAlertsEnabled: true });
  });

  it("does nothing, and sends nothing, when the slice is clean", async () => {
    const hook = renderReport();
    let sent: UserSettings | null | undefined;
    await hook.act(async () => {
      sent = await hook.current.save();
    });
    expect(sent).toBeNull();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("a save from another screen does not wipe unsaved edits in this slice", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    // The Reminder settings screen saves.
    await savedElsewhere(hook, { reminderTime: "10:00", reminderOverdueNudges: 4 });
    expect(hook.current.draft.reportRoastLevel).toBe("savage");
    expect(hook.current.isDirty).toBe(true);
    // The other slice's settings are not this slice's to be dirty about.
    expect(hook.current.draft.reminderTime).toBe("10:00");
  });

  it("a slice that is not dirty follows the saved settings", async () => {
    const hook = renderReport();
    await savedElsewhere(hook, { reportRoastLevel: "gentle" });
    expect(hook.current.draft.reportRoastLevel).toBe("gentle");
    expect(hook.current.isDirty).toBe(false);
  });

  it("an edit the saved settings catch up with stops counting as an edit", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    await savedElsewhere(hook, { reportRoastLevel: "savage" });
    expect(hook.current.isDirty).toBe(false);
    // The old edit must not come back when the saved value moves on.
    await savedElsewhere(hook, { reportRoastLevel: "gentle" });
    expect(hook.current.draft.reportRoastLevel).toBe("gentle");
    expect(hook.current.isDirty).toBe(false);
  });

  it("Clear drops the edits and bumps the sync key", async () => {
    const hook = renderReport();
    const before = hook.current.syncKey;
    await hook.act(async () => {
      hook.current.patchDraft({ reportAlertsEnabled: false });
      await settle();
    });
    await hook.act(async () => {
      hook.current.clear();
      await settle();
    });
    expect(hook.current.draft.reportAlertsEnabled).toBe(true);
    expect(hook.current.isDirty).toBe(false);
    expect(hook.current.syncKey).toBe(before + 1);
  });

  it("drops its edits once the save goes through", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    mockMutate.mockImplementationOnce(async () => {
      mockStore.set({ ...mockStore.value, reportRoastLevel: "savage" });
    });
    await hook.act(async () => {
      await hook.current.save();
    });
    expect(hook.current.isDirty).toBe(false);
    await savedElsewhere(hook, { reportRoastLevel: "spicy" });
    expect(hook.current.draft.reportRoastLevel).toBe("spicy");
  });

  it("a failed save throws and keeps the edits for another try", async () => {
    const hook = renderReport();
    await hook.act(async () => {
      hook.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    mockMutate.mockRejectedValueOnce(new Error("offline"));
    let error: unknown = null;
    await hook.act(async () => {
      await hook.current.save().catch((caught: unknown) => {
        error = caught;
      });
    });
    expect(error).toBeInstanceOf(Error);
    expect(hook.current.draft.reportRoastLevel).toBe("savage");
    expect(hook.current.isDirty).toBe(true);
  });

  it("an edit can read the current draft (toggling a lead day)", async () => {
    const hook = renderReminder();
    await hook.act(async () => {
      hook.current.patchDraft((draft) => ({
        reminderDefaultLeadDays: [...draft.reminderDefaultLeadDays, 7],
      }));
      hook.current.patchDraft((draft) => ({
        reminderDefaultLeadDays: draft.reminderDefaultLeadDays.filter((day) => day !== 3),
      }));
      await settle();
    });
    expect(hook.current.draft.reminderDefaultLeadDays).toEqual([1, 0, 7]);
    await hook.act(async () => {
      await hook.current.save();
    });
    expect(mockMutate).toHaveBeenCalledWith({ reminderDefaultLeadDays: [1, 0, 7] });
  });

  it("two slices on one screen edit and save independently", async () => {
    const reports = renderReport();
    const reminders = renderReminder();
    await reports.act(async () => {
      reports.current.patchDraft({ reportRoastLevel: "savage" });
      await settle();
    });
    expect(reports.current.isDirty).toBe(true);
    expect(reminders.current.isDirty).toBe(false);
    await reminders.act(async () => {
      await reminders.current.save();
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
