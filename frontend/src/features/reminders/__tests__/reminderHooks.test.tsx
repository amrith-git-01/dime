import type { QueryClient } from "@tanstack/react-query";

import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import {
  completeReminder,
  createReminder,
  deleteReminder,
  fetchReminders,
  skipReminder,
  updateReminder,
} from "../api/remindersApi";
import {
  useCompleteReminderMutation,
  useCreateReminderMutation,
  useDeleteReminderMutation,
  useSkipReminderMutation,
  useUpdateReminderMutation,
} from "../hooks/useReminderMutations";
import { useRemindersQuery } from "../hooks/useRemindersQuery";
import { REMINDER_CACHE_SHAPE, reminderQueryKeys } from "../queryKeys";
import type { Reminder } from "../types";

jest.mock("@/lib/api/dimeApi", () => ({ dimeApi: {} }));
jest.mock("../api/remindersApi", () => ({
  ...jest.requireActual("../api/remindersApi"),
  fetchReminders: jest.fn(),
  createReminder: jest.fn(),
  updateReminder: jest.fn(),
  deleteReminder: jest.fn(),
  completeReminder: jest.fn(),
  skipReminder: jest.fn(),
}));
jest.mock("@/hooks/useSessionUserId", () => ({
  useSessionUserId: () => ({ userId: "u1" }),
}));
jest.mock("@/features/onboarding/utils/askNotificationsInContext", () => ({
  askNotificationsInContext: jest.fn(() => Promise.resolve()),
}));

const list = jest.mocked(fetchReminders);

function reminder(id: string, over: Partial<Reminder> = {}): Reminder {
  return {
    id,
    direction: "pay",
    title: `R ${id}`,
    amount: null,
    counterparty_name: null,
    upi_id: null,
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

const OPEN_KEY = reminderQueryKeys.list("u1", "open");

async function flush(hook: { act: (cb: () => Promise<void>) => unknown }) {
  for (let turn = 0; turn < 4; turn += 1) {
    await hook.act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("reminder queries", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.resetAllMocks();
    queryClient = createTestQueryClient();
  });
  afterEach(() => queryClient.clear());

  it("keys lists by user and status, with the shape version", () => {
    expect(reminderQueryKeys.list("u1", "open")).toEqual([
      "reminders",
      `list.v${REMINDER_CACHE_SHAPE}`,
      "u1",
      "open",
    ]);
    expect(reminderQueryKeys.list(undefined, "done")[2]).toBe("none");
  });

  it("loads the open list under the user's key", async () => {
    list.mockResolvedValue([reminder("a")]);
    const hook = renderHookWithClient(queryClient, () => useRemindersQuery());
    await flush(hook);
    expect(hook.current.data?.map((r) => r.id)).toEqual(["a"]);
    expect(list).toHaveBeenCalledWith("open");
    expect(queryClient.getQueryData(OPEN_KEY)).toEqual([reminder("a")]);
  });

  it("loads another status only when asked, and waits while disabled", async () => {
    list.mockResolvedValue([]);
    const hook = renderHookWithClient(queryClient, () => useRemindersQuery("done", { enabled: false }));
    await flush(hook);
    expect(list).not.toHaveBeenCalled();
    expect(hook.current.fetchStatus).toBe("idle");
  });

  it("drops unusable rows that came from a stored copy", async () => {
    queryClient.setQueryData(OPEN_KEY, [reminder("a"), { id: "broken" }]);
    list.mockResolvedValue([reminder("a")]);
    const hook = renderHookWithClient(queryClient, () => useRemindersQuery());
    expect(hook.current.data?.map((r) => r.id)).toEqual(["a"]);
    await flush(hook);
  });
});

describe("reminder mutations", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.resetAllMocks();
    queryClient = createTestQueryClient();
    queryClient.setQueryData(OPEN_KEY, [reminder("a"), reminder("b", { cadence: "monthly" })]);
    queryClient.setQueryData(reminderQueryKeys.list("u1", "done"), []);
  });
  afterEach(() => queryClient.clear());

  const ids = () => queryClient.getQueryData<Reminder[]>(OPEN_KEY)?.map((r) => r.id);

  it("create, update and skip refresh every list", async () => {
    (createReminder as jest.Mock).mockResolvedValue(reminder("c"));
    (updateReminder as jest.Mock).mockResolvedValue(reminder("a"));
    (skipReminder as jest.Mock).mockResolvedValue(reminder("b"));

    const create = renderHookWithClient(queryClient, useCreateReminderMutation);
    await create.act(async () => {
      await create.current.mutateAsync({
        direction: "pay",
        title: "x",
        due_date: "2026-11-05",
        timezone: "Asia/Kolkata",
      });
    });
    expect(queryClient.getQueryState(OPEN_KEY)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(reminderQueryKeys.list("u1", "done"))?.isInvalidated).toBe(true);

    queryClient.setQueryData(OPEN_KEY, [reminder("a")]);
    const update = renderHookWithClient(queryClient, useUpdateReminderMutation);
    await update.act(async () => {
      await update.current.mutateAsync({ id: "a", body: { title: "y" } });
    });
    expect(updateReminder).toHaveBeenCalledWith("a", { title: "y" });
    expect(queryClient.getQueryState(OPEN_KEY)?.isInvalidated).toBe(true);

    const skip = renderHookWithClient(queryClient, useSkipReminderMutation);
    await skip.act(async () => {
      await skip.current.mutateAsync("b");
    });
    expect(skipReminder).toHaveBeenCalledWith("b");
  });

  it("delete takes the row off the open list at once and puts it back on failure", async () => {
    let reject!: (error: Error) => void;
    (deleteReminder as jest.Mock).mockReturnValue(
      new Promise<void>((_resolve, rej) => {
        reject = rej;
      }),
    );
    const hook = renderHookWithClient(queryClient, useDeleteReminderMutation);
    let pending!: Promise<unknown>;
    await hook.act(async () => {
      pending = hook.current.mutateAsync("a").catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(ids()).toEqual(["b"]);

    await hook.act(async () => {
      reject(new Error("offline"));
      await pending;
    });
    expect(ids()).toEqual(["a", "b"]);
  });

  it("completing a one-off leaves the list at once", async () => {
    (completeReminder as jest.Mock).mockReturnValue(new Promise(() => undefined));
    const hook = renderHookWithClient(queryClient, useCompleteReminderMutation);
    await hook.act(async () => {
      void hook.current.mutateAsync({ reminder: { id: "a", cadence: "none" }, transactionId: "t1" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(ids()).toEqual(["b"]);
    expect(completeReminder).toHaveBeenCalledWith("a", "t1");
  });

  it("completing a repeating one keeps it (the server moves it to the next date)", async () => {
    (completeReminder as jest.Mock).mockResolvedValue(reminder("b"));
    const hook = renderHookWithClient(queryClient, useCompleteReminderMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ reminder: { id: "b", cadence: "monthly" } });
    });
    expect(ids()).toEqual(["a", "b"]);
    expect(completeReminder).toHaveBeenCalledWith("b", undefined);
    expect(queryClient.getQueryState(OPEN_KEY)?.isInvalidated).toBe(true);
  });

  it("a failed completion restores the row", async () => {
    (completeReminder as jest.Mock).mockRejectedValue(new Error("nope"));
    const hook = renderHookWithClient(queryClient, useCompleteReminderMutation);
    await hook.act(async () => {
      await hook.current
        .mutateAsync({ reminder: { id: "a", cadence: "none" } })
        .catch(() => undefined);
    });
    expect(ids()).toEqual(["a", "b"]);
  });
});
