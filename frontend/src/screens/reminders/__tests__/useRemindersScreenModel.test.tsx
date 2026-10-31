import { Linking, Share } from "react-native";

import type { Reminder } from "@/features/reminders/types";
import { useToastUiStore } from "@/stores/toastUiStore";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { HIGHLIGHT_MS, useRemindersScreenModel } from "../useRemindersScreenModel";

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };
const mockRoute = { params: undefined as { highlightId?: string } | undefined };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
}));

const mockOpen = { value: {} as Record<string, unknown> };
const mockDone = { value: {} as Record<string, unknown> };
jest.mock("@/features/reminders/hooks/useRemindersQuery", () => ({
  useRemindersQuery: (status: string) => (status === "open" ? mockOpen.value : mockDone.value),
}));

const mockComplete = jest.fn();
const mockSkip = jest.fn();
const mockUpdate = jest.fn();
const mockRemove = jest.fn();
jest.mock("@/features/reminders/hooks/useReminderMutations", () => ({
  useCompleteReminderMutation: () => ({ mutateAsync: mockComplete }),
  useSkipReminderMutation: () => ({ mutateAsync: mockSkip }),
  useUpdateReminderMutation: () => ({ mutateAsync: mockUpdate }),
  useDeleteReminderMutation: () => ({ mutateAsync: mockRemove }),
}));
jest.mock("@/features/settings/hooks/useUserSettingsQuery", () => ({
  useUserSettingsQuery: () => ({ data: { reportRoastLevel: "savage", upiId: "me@okbank" } }),
}));
jest.mock("@/features/profile/hooks/useCurrentUserProfileQuery", () => ({
  useCurrentUserProfileQuery: () => ({ data: { username: "Amrith" } }),
}));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));
jest.mock("@/lib/haptics/nativeHaptics", () => ({
  triggerHaptic: jest.fn(() => Promise.resolve()),
  triggerConfirmHaptic: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/api/baseUrl", () => ({ getDimeApiBaseUrl: () => "https://api.example" }));

function reminder(id: string, over: Partial<Reminder> = {}): Reminder {
  return {
    id,
    direction: "pay",
    title: `Item ${id}`,
    amount: "100.00",
    counterparty_name: "Ravi",
    upi_id: "ravi@okbank",
    due_date: "2026-11-05",
    cadence: "none",
    lead_days: null,
    effective_lead_days: [],
    remind_time: null,
    timezone: "Asia/Kolkata",
    status: "open",
    completed_at: null,
    next_fire_at: null,
    suggested_match: null,
    ...over,
  };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function render() {
  return renderHookWithClient(createTestQueryClient(), () => useRemindersScreenModel());
}

function toasts(): string[] {
  const { current, queue } = useToastUiStore.getState();
  return [current, ...queue].map((toast) => toast?.message ?? "");
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockRoute.params = undefined;
  mockOpen.value = { data: [reminder("a")], isPending: false, isError: false, refetch: jest.fn() };
  mockDone.value = { data: undefined, isPending: false, isError: false, refetch: jest.fn() };
  useToastUiStore.setState({ current: null, queue: [] });
});

describe("useRemindersScreenModel", () => {
  it("groups the open reminders and counts them", () => {
    mockOpen.value = {
      data: [reminder("a"), reminder("b", { due_date: "2020-01-01" })],
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    };
    const hook = render();
    expect(hook.current.openCount).toBe(2);
    expect(hook.current.sections[0]?.id).toBe("overdue");
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.isError).toBe(false);
  });

  it("reports loading, and an error only when there is nothing to show", () => {
    mockOpen.value = { data: undefined, isPending: true, isError: false, refetch: jest.fn() };
    expect(render().current.isLoading).toBe(true);
    mockOpen.value = { data: undefined, isPending: false, isError: true, refetch: jest.fn() };
    expect(render().current.isError).toBe(true);
    mockOpen.value = { data: [reminder("a")], isPending: false, isError: true, refetch: jest.fn() };
    expect(render().current.isError).toBe(false);
  });

  it("opens the editor to add and to edit", () => {
    const hook = render();
    hook.current.onAdd();
    expect(mockNav.navigate).toHaveBeenLastCalledWith("ReminderEditor", {});
    const r = reminder("a");
    hook.current.onEdit(r);
    expect(mockNav.navigate).toHaveBeenLastCalledWith("ReminderEditor", { reminder: r });
  });

  it("marks paid (with or without the matching transaction) and says so", async () => {
    mockComplete.mockResolvedValue(null);
    const hook = render();
    const r = reminder("a");
    await hook.act(async () => {
      hook.current.onMarkDone(r, "t1");
      await settle();
    });
    expect(mockComplete).toHaveBeenCalledWith({ reminder: r, transactionId: "t1" });
    expect(toasts()).toContain("Marked paid");

    const income = reminder("b", { direction: "receive" });
    await hook.act(async () => {
      hook.current.onMarkDone(income);
      await settle();
    });
    expect(mockComplete).toHaveBeenLastCalledWith({ reminder: income, transactionId: undefined });
    expect(toasts()).toContain("Marked received");
    expect(hook.current.busyId).toBeNull();
  });

  it("shows the server's message when an action fails and frees the row", async () => {
    mockSkip.mockRejectedValue(new Error("Only repeating reminders can be skipped"));
    const hook = render();
    await hook.act(async () => {
      hook.current.onSkip(reminder("a", { cadence: "monthly" }));
      await settle();
    });
    expect(toasts()).toContain("Only repeating reminders can be skipped");
    expect(hook.current.busyId).toBeNull();
  });

  it("skips and reopens", async () => {
    mockSkip.mockResolvedValue(null);
    mockUpdate.mockResolvedValue(null);
    const hook = render();
    await hook.act(async () => {
      hook.current.onSkip(reminder("a", { cadence: "weekly" }));
      await settle();
    });
    expect(mockSkip).toHaveBeenCalledWith("a");
    expect(toasts()).toContain("Moved to the next date");
    await hook.act(async () => {
      hook.current.onReopen(reminder("c", { status: "done" }));
      await settle();
    });
    expect(mockUpdate).toHaveBeenCalledWith({ id: "c", body: { status: "open" } });
  });

  it("asks before deleting and only deletes on confirm", async () => {
    mockRemove.mockResolvedValue(undefined);
    const hook = render();
    const r = reminder("a");
    await hook.act(async () => {
      hook.current.onDeletePress(r);
      await settle();
    });
    expect(hook.current.pendingDelete).toBe(r);
    expect(mockRemove).not.toHaveBeenCalled();

    await hook.act(async () => {
      hook.current.onDeleteCancel();
      await settle();
    });
    expect(hook.current.pendingDelete).toBeNull();

    await hook.act(async () => {
      hook.current.onDeletePress(r);
      await settle();
    });
    await hook.act(async () => {
      hook.current.onDeleteConfirm();
      await settle();
    });
    expect(mockRemove).toHaveBeenCalledWith("a");
    expect(hook.current.pendingDelete).toBeNull();
    expect(toasts()).toContain("Reminder deleted");
  });

  describe("Pay now", () => {
    const open = jest.spyOn(Linking, "openURL");

    it("opens the UPI app", async () => {
      open.mockReset();
      open.mockResolvedValue(true);
      const hook = render();
      await hook.act(async () => {
        hook.current.onPayNow(reminder("a"));
      await settle();
      });
      expect(open).toHaveBeenCalledWith(expect.stringMatching(/^upi:\/\/pay\?pa=ravi@okbank/));
      expect(toasts()).toEqual([""]);
    });

    it("says No UPI app found, and nothing crashes, when none can open it", async () => {
      open.mockReset();
      open.mockRejectedValue(new Error("Unable to open URL: upi://pay"));
      const hook = render();
      await hook.act(async () => {
        hook.current.onPayNow(reminder("a"));
      await settle();
      });
      expect(toasts()).toContain("No UPI app found");
    });

    it("explains what is missing instead of trying", async () => {
      open.mockReset();
      const hook = render();
      await hook.act(async () => {
        hook.current.onPayNow(reminder("a", { upi_id: null }));
      await settle();
      });
      expect(open).not.toHaveBeenCalled();
      expect(toasts().some((m) => m.startsWith("Add their UPI ID"))).toBe(true);
    });
  });

  describe("Nudge", () => {
    const share = jest.spyOn(Share, "share");

    it("shares the message in the user's tone, with the pay link from My UPI ID", async () => {
      share.mockReset();
      share.mockResolvedValue({ action: "sharedAction" });
      const hook = render();
      await hook.act(async () => {
        hook.current.onNudge(reminder("n1", { direction: "receive", title: "Dinner", amount: "800.00" }));
      await settle();
      });
      const message = (share.mock.calls[0]![0] as { message: string }).message;
      expect(message).toContain("Hi Ravi,");
      expect(message).toContain("₹800 for Dinner");
      expect(message).toContain("Pay here: https://api.example/pay?pa=me@okbank&pn=Amrith&am=800.00");
    });

    it("tells the user when the share sheet cannot open", async () => {
      share.mockReset();
      share.mockRejectedValue(new Error("nope"));
      const hook = render();
      await hook.act(async () => {
        hook.current.onNudge(reminder("n1", { direction: "receive" }));
      await settle();
      });
      expect(toasts()).toContain("Couldn't open the share sheet.");
    });
  });

  describe("highlight (from a notification or Home)", () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("tints the reminder for a few seconds", async () => {
      jest.useFakeTimers();
      mockRoute.params = { highlightId: "a" };
      const hook = render();
      expect(hook.current.highlightedId).toBe("a");
      await hook.act(async () => {
        jest.advanceTimersByTime(HIGHLIGHT_MS + 10);
      });
      expect(hook.current.highlightedId).toBeNull();
    });

    it("has none without a target", () => {
      expect(render().current.highlightedId).toBeNull();
    });
  });

  it("loads the done list only once Done is opened", async () => {
    const hook = render();
    expect(hook.current.doneExpanded).toBe(false);
    expect(hook.current.doneLoading).toBe(false);
    await hook.act(async () => {
      hook.current.toggleDone();
      await settle();
    });
    expect(hook.current.doneExpanded).toBe(true);
    mockDone.value = {
      data: [
        reminder("old", { status: "done", completed_at: "2026-10-01T00:00:00Z" }),
        reminder("newer", { status: "dismissed", completed_at: "2026-10-05T00:00:00Z" }),
      ],
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    };
    await hook.act(async () => undefined);
    const again = render();
    await again.act(async () => {
      again.current.toggleDone();
      await settle();
    });
    expect(again.current.doneItems.map((r) => r.id)).toEqual(["newer", "old"]);
  });
});
