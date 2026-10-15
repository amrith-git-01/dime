import { AxiosError } from "axios";
import { format } from "date-fns";

import { dimeApi } from "@/lib/api/dimeApi";
import { getSession } from "@/lib/auth/session";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  drainWidgetOutbox,
  resetWidgetTapGuard,
  runWidgetPreset,
  undoLastWidgetAction,
  WIDGET_DOUBLE_TAP_GUARD_MS,
} from "../widgetPresetActions";
import {
  canUndoWidgetAction,
  readWidgetLastAction,
  readWidgetOutbox,
  writeWidgetLastAction,
  writeWidgetOutbox,
  writeWidgetPresets,
  type WidgetOutboxItem,
} from "../widgetPresetsMmkv";
import { readWidgetSnapshot, writeWidgetSnapshot } from "../widgetSnapshotMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@/widgets/refreshWidgets", () => ({ refreshWidgets: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getSession: jest.fn() }));
jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { post: jest.fn(), delete: jest.fn() },
  getDimeApiBaseUrl: () => "https://api.test",
  getDimeAuthHeaders: jest.fn(),
  refreshDimeAuthHeaders: jest.fn(),
}));
jest.mock("expo-crypto", () => {
  let counter = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}` };
});

const post = jest.mocked(dimeApi.post);
const del = jest.mocked(dimeApi.delete);
const redraw = jest.fn();

const USER = "user-a";
const NOW = new Date();
const T0 = NOW.getTime();

function signIn(userId: string | null = USER): void {
  jest.mocked(getSession).mockReturnValue(
    userId ? ({ user: { id: userId } } as never) : null,
  );
}

function seedSnapshot(): void {
  writeWidgetSnapshot({
    userId: USER,
    updatedAt: T0,
    monthKey: format(NOW, "yyyy-MM"),
    dayKey: format(NOW, "yyyy-MM-dd"),
    spentThisMonth: 1000,
    recurringSpent: 200,
    flexibleSpent: 800,
    monthlyBudget: 5000,
    budgetLeft: 4000,
    spentToday: 100,
    recentTransactions: [],
    topCategories: [],
    recurring: [],
  });
}

function axiosFailure(status?: number, code?: string): AxiosError {
  return new AxiosError(
    "failed",
    code,
    undefined,
    undefined,
    status ? ({ status, data: {}, statusText: "", headers: {}, config: {} } as never) : undefined,
  );
}

function queuedItem(overrides: Partial<WidgetOutboxItem> = {}): WidgetOutboxItem {
  return {
    key: "00000000-0000-4000-8000-0000000000aa",
    userId: USER,
    body: {
      amount: "20.00",
      type: "debit",
      counterparty_name: "Chai",
      counterparty_type: "merchant",
      category: null,
      category_id: "cat-1",
      note: null,
      transaction_at: NOW.toISOString(),
    },
    label: "Chai",
    amount: 20,
    createdAt: T0,
    ...overrides,
  };
}

beforeEach(() => {
  resetMockMmkv();
  resetWidgetTapGuard();
  jest.clearAllMocks();
  signIn();
  seedSnapshot();
  writeWidgetPresets(USER, [
    { label: "Chai", amount: 20, categoryId: "cat-1" },
    { label: "Auto", amount: 50, categoryId: "cat-2" },
  ]);
});

describe("runWidgetPreset", () => {
  it("queues first, shows Adding, posts with an idempotency key, then reports Added with an id", async () => {
    let seenWhileSending: { outbox: number; kind?: string } | undefined;
    post.mockImplementationOnce(async () => {
      seenWhileSending = {
        outbox: readWidgetOutbox().length,
        kind: readWidgetLastAction()?.kind,
      };
      return { data: { accepted: true, id: "tx-1" } };
    });

    await runWidgetPreset(0, redraw, T0);

    expect(seenWhileSending).toEqual({ outbox: 1, kind: "adding" });
    expect(post).toHaveBeenCalledTimes(1);
    const [path, body, config] = post.mock.calls[0]!;
    expect(path).toBe("/api/v1/transactions");
    expect(body).toMatchObject({
      amount: "20.00",
      type: "debit",
      counterparty_name: "Chai",
      counterparty_type: "merchant",
      category: null,
      category_id: "cat-1",
      transaction_at: NOW.toISOString(),
    });
    expect(config).toMatchObject({ timeout: 10_000 });
    expect(config?.headers?.["Idempotency-Key"]).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{7,99}$/);

    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toMatchObject({
      kind: "added",
      userId: USER,
      createdAt: T0,
      id: "tx-1",
      label: "Chai",
      amount: 20,
      key: config?.headers?.["Idempotency-Key"],
    });
    expect(redraw.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("bumps the snapshot so the widgets update at once", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "tx-1" } });
    await runWidgetPreset(0, redraw, T0);
    expect(readWidgetSnapshot()).toMatchObject({
      spentThisMonth: 1020,
      flexibleSpent: 820,
      recurringSpent: 200,
      spentToday: 120,
      budgetLeft: 3980,
    });
    expect(readWidgetSnapshot()?.recentTransactions[0]).toMatchObject({
      id: "tx-1",
      name: "Chai",
      amount: 20,
      type: "debit",
    });
  });

  it("keeps the tap queued and says so when the network fails or times out", async () => {
    post.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    await runWidgetPreset(0, redraw, T0);
    expect(readWidgetOutbox()).toHaveLength(1);
    expect(readWidgetLastAction()).toMatchObject({ kind: "queued", label: "Chai" });
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000);

    post.mockRejectedValueOnce(axiosFailure(undefined, "ECONNABORTED"));
    await runWidgetPreset(1, redraw, T0);
    expect(readWidgetOutbox()).toHaveLength(2);
  });

  it("keeps the tap queued on a server error, a rate limit or a still-processing key", async () => {
    for (const [index, status] of [500, 429, 409].entries()) {
      resetWidgetTapGuard();
      writeWidgetOutbox([]);
      post.mockRejectedValueOnce(axiosFailure(status));
      await runWidgetPreset(0, redraw, T0 + index);
      expect(readWidgetOutbox()).toHaveLength(1);
      expect(readWidgetLastAction()?.kind).toBe("queued");
    }
  });

  it("drops a tap the server refuses (4xx) and shows Couldn't add", async () => {
    post.mockRejectedValueOnce(axiosFailure(422));
    await runWidgetPreset(0, redraw, T0);
    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toMatchObject({ kind: "failed" });
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000);
  });

  it("shows Sign in to Dime on a 401 (after dimeApi's own refresh) and keeps the tap", async () => {
    post.mockRejectedValueOnce(axiosFailure(401));
    await runWidgetPreset(0, redraw, T0);
    expect(readWidgetLastAction()).toMatchObject({ kind: "signedOut" });
    expect(readWidgetOutbox()).toHaveLength(1);
  });

  it("shows Sign in to Dime without a session, and sends nothing", async () => {
    signIn(null);
    await runWidgetPreset(0, redraw, T0);
    expect(post).not.toHaveBeenCalled();
    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toMatchObject({ kind: "signedOut" });
  });

  it("ignores a second tap on the same preset within 3 seconds, not on another or later", async () => {
    post.mockResolvedValue({ data: { accepted: true, id: "tx-1" } });
    await runWidgetPreset(0, redraw, T0);
    await runWidgetPreset(0, redraw, T0 + WIDGET_DOUBLE_TAP_GUARD_MS - 1);
    expect(post).toHaveBeenCalledTimes(1);

    await runWidgetPreset(1, redraw, T0 + 10);
    expect(post).toHaveBeenCalledTimes(2);

    await runWidgetPreset(0, redraw, T0 + WIDGET_DOUBLE_TAP_GUARD_MS);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("does nothing for a preset that does not exist", async () => {
    await runWidgetPreset(2, redraw, T0);
    expect(post).not.toHaveBeenCalled();
    expect(readWidgetOutbox()).toEqual([]);
  });

  it("copes with a replayed response that has no id", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true } });
    await runWidgetPreset(0, redraw, T0);
    const action = readWidgetLastAction();
    expect(action).toMatchObject({ kind: "added", label: "Chai" });
    expect(action?.id).toBeUndefined();
    // Nothing to delete by, so Undo is not offered and does nothing.
    expect(canUndoWidgetAction(action)).toBe(false);
    await undoLastWidgetAction(redraw);
    expect(del).not.toHaveBeenCalled();
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1020);
  });
});

describe("drainWidgetOutbox", () => {
  it("does nothing, not even a request, with an empty outbox", async () => {
    expect(await drainWidgetOutbox(redraw)).toBe(0);
    expect(post).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("sends queued taps oldest first, reusing each tap's idempotency key", async () => {
    writeWidgetOutbox([
      queuedItem({ key: "11111111-aaaa-4aaa-8aaa-111111111111", label: "First" }),
      queuedItem({ key: "22222222-bbbb-4bbb-8bbb-222222222222", label: "Second" }),
    ]);
    post.mockResolvedValue({ data: { accepted: true, id: "tx" } });

    expect(await drainWidgetOutbox(redraw)).toBe(2);

    expect(post.mock.calls.map((call) => call[2]?.headers?.["Idempotency-Key"])).toEqual([
      "11111111-aaaa-4aaa-8aaa-111111111111",
      "22222222-bbbb-4bbb-8bbb-222222222222",
    ]);
    expect(readWidgetOutbox()).toEqual([]);
  });

  it("does not let one retryable tap block the ones behind it", async () => {
    writeWidgetOutbox([queuedItem({ key: "k-first-0001" }), queuedItem({ key: "k-second-0002" })]);
    post
      .mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"))
      .mockResolvedValueOnce({ data: { accepted: true, id: "tx-2", created: true } });
    expect(await drainWidgetOutbox(redraw)).toBe(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(readWidgetOutbox().map((item) => item.key)).toEqual(["k-first-0001"]);
  });

  it("stops at a 401: every later tap would fail the same way", async () => {
    writeWidgetOutbox([queuedItem({ key: "k-first-0001" }), queuedItem({ key: "k-second-0002" })]);
    post.mockRejectedValueOnce(axiosFailure(401));
    await drainWidgetOutbox(redraw);
    expect(post).toHaveBeenCalledTimes(1);
    expect(readWidgetOutbox()).toHaveLength(2);
  });

  it("an older tap's result does not replace the status of a newer tap", async () => {
    const newer = queuedItem({ key: "k-newer-00002", createdAt: T0 });
    writeWidgetOutbox([queuedItem({ key: "k-older-00001", createdAt: T0 - 5000 }), newer]);
    writeWidgetLastAction({
      kind: "adding",
      userId: USER,
      key: newer.key,
      label: "Chai",
      amount: 20,
      at: T0,
      createdAt: T0,
    });
    post.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    post.mockImplementationOnce(async () => {
      // While the newer tap is still being sent, its status is the one on screen.
      expect(readWidgetLastAction()).toMatchObject({ kind: "adding", key: newer.key });
      return { data: { accepted: true, id: "tx-2", created: true } };
    });
    await drainWidgetOutbox(redraw);
    expect(readWidgetLastAction()).toMatchObject({ kind: "added", key: newer.key });
  });

  it("shares one pass between simultaneous callers", async () => {
    writeWidgetOutbox([queuedItem()]);
    post.mockResolvedValue({ data: { accepted: true, id: "tx" } });
    const [a, b] = await Promise.all([drainWidgetOutbox(redraw), drainWidgetOutbox(redraw)]);
    expect(a).toBe(b);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("drops taps queued by another account", async () => {
    writeWidgetOutbox([queuedItem({ userId: "someone-else" })]);
    expect(await drainWidgetOutbox(redraw)).toBe(0);
    expect(post).not.toHaveBeenCalled();
    expect(readWidgetOutbox()).toEqual([]);
  });

  it("passes an abort signal so the whole pass can be cut short", async () => {
    writeWidgetOutbox([queuedItem()]);
    post.mockResolvedValueOnce({ data: { accepted: true } });
    await drainWidgetOutbox(redraw);
    expect(post.mock.calls[0]![2]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("undoLastWidgetAction", () => {
  it("takes a still-queued tap back out of the outbox without a request", async () => {
    post.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    await runWidgetPreset(0, redraw, T0);
    expect(canUndoWidgetAction(readWidgetLastAction())).toBe(true);

    await undoLastWidgetAction(redraw);

    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toMatchObject({ kind: "undone" });
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes the created transaction and reverts the snapshot bump", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "tx-1" } });
    await runWidgetPreset(0, redraw, T0);
    del.mockResolvedValueOnce({ data: undefined });

    await undoLastWidgetAction(redraw);

    expect(del).toHaveBeenCalledWith(
      "/api/v1/transactions/tx-1",
      expect.objectContaining({ timeout: 10_000 }),
    );
    expect(readWidgetLastAction()).toMatchObject({ kind: "undone" });
    expect(readWidgetSnapshot()).toMatchObject({
      spentThisMonth: 1000,
      flexibleSpent: 800,
      spentToday: 100,
      budgetLeft: 4000,
      recentTransactions: [],
    });
  });

  it("counts a 404 as already done, without touching the snapshot (it already excludes the row)", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "tx-1" } });
    await runWidgetPreset(0, redraw, T0);
    del.mockRejectedValueOnce(axiosFailure(404));
    await undoLastWidgetAction(redraw);
    expect(readWidgetLastAction()).toMatchObject({ kind: "undone" });
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1020);
  });

  it("keeps the amount and offers Undo again when the delete cannot reach the server", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "tx-1" } });
    await runWidgetPreset(0, redraw, T0);
    del.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    await undoLastWidgetAction(redraw);
    const action = readWidgetLastAction();
    expect(action).toMatchObject({ kind: "undoFailed", id: "tx-1" });
    expect(canUndoWidgetAction(action)).toBe(true);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1020);
  });

  it("is only valid for two minutes", async () => {
    writeWidgetLastAction({
      kind: "added",
      userId: USER,
      id: "tx-1",
      key: "k",
      label: "Chai",
      amount: 20,
      // Re-set later (a failed undo), but the window runs from the tap.
      at: T0 + 90_000,
      createdAt: T0,
    });
    await undoLastWidgetAction(redraw, T0 + 2 * 60_000 + 1);
    expect(del).not.toHaveBeenCalled();
    expect(readWidgetLastAction()?.kind).toBe("added");

    del.mockResolvedValueOnce({ data: undefined });
    await undoLastWidgetAction(redraw, T0 + 2 * 60_000);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is nothing to undo", async () => {
    await undoLastWidgetAction(redraw);
    expect(del).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });
});

describe("a payment the server already had", () => {
  it("is reported as Already added: no bump, no id, nothing to undo", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "someone-elses-row", created: false } });
    await runWidgetPreset(0, redraw, T0);

    expect(readWidgetOutbox()).toEqual([]);
    const action = readWidgetLastAction();
    expect(action).toMatchObject({ kind: "duplicate", label: "Chai" });
    expect(action?.id).toBeUndefined();
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000);
    expect(canUndoWidgetAction(action)).toBe(false);
    await undoLastWidgetAction(redraw);
    expect(del).not.toHaveBeenCalled();
  });

  it("treats a response without the created flag as created (an older replay)", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "tx-1" } });
    await runWidgetPreset(0, redraw, T0);
    expect(readWidgetLastAction()).toMatchObject({ kind: "added", id: "tx-1" });
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1020);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
}

describe("Undo while a send is in flight", () => {
  async function queueOneThenStartRetry() {
    post.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    await runWidgetPreset(0, redraw, T0);
    const send = deferred<{ data: unknown }>();
    post.mockImplementationOnce(() => send.promise as never);
    const drain = drainWidgetOutbox(redraw);
    await flush();
    return { send, drain };
  }

  it("flags the send, shows Undoing, and deletes the new row the moment it lands", async () => {
    const { send, drain } = await queueOneThenStartRetry();

    await undoLastWidgetAction(redraw);
    expect(readWidgetLastAction()).toMatchObject({ kind: "undoing" });
    expect(readWidgetOutbox()[0]).toMatchObject({ undoRequested: true });
    expect(del).not.toHaveBeenCalled();

    del.mockResolvedValueOnce({ data: undefined });
    send.resolve({ data: { accepted: true, id: "tx-9", created: true } });
    await drain;

    expect(del).toHaveBeenCalledWith(
      "/api/v1/transactions/tx-9",
      expect.objectContaining({ timeout: 10_000 }),
    );
    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toMatchObject({ kind: "undone" });
    // Never counted, so nothing to take back out.
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000);
  });

  it("counts the row and offers Undo again when that delete fails", async () => {
    const { send, drain } = await queueOneThenStartRetry();
    await undoLastWidgetAction(redraw);

    del.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    send.resolve({ data: { accepted: true, id: "tx-9", created: true } });
    await drain;

    expect(readWidgetLastAction()).toMatchObject({ kind: "undoFailed", id: "tx-9" });
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1020);
  });

  it("keeps the flag and waits when the flagged send has to be retried again", async () => {
    post.mockRejectedValueOnce(axiosFailure(undefined, "ERR_NETWORK"));
    await runWidgetPreset(0, redraw, T0);
    let fail!: (error: unknown) => void;
    post.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          fail = reject;
        }) as never,
    );
    const drain = drainWidgetOutbox(redraw);
    await flush();
    await undoLastWidgetAction(redraw);

    fail(axiosFailure(undefined, "ERR_NETWORK"));
    await drain;

    expect(readWidgetOutbox()[0]).toMatchObject({ undoRequested: true });
    expect(readWidgetLastAction()).toMatchObject({ kind: "undoing" });
  });
});

describe("signing out or switching account mid-drain", () => {
  it("writes nothing for the old account once the request returns", async () => {
    const send = deferred<{ data: unknown }>();
    post.mockImplementationOnce(() => send.promise as never);
    const tap = runWidgetPreset(0, redraw, T0);
    await flush();

    signIn("user-b");
    send.resolve({ data: { accepted: true, id: "tx-1", created: true } });
    await tap;

    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000);
    expect(readWidgetLastAction()).toMatchObject({ kind: "adding", userId: USER });
  });

  it("does the same when the session is gone", async () => {
    const send = deferred<{ data: unknown }>();
    post.mockImplementationOnce(() => send.promise as never);
    const tap = runWidgetPreset(0, redraw, T0);
    await flush();

    signIn(null);
    send.resolve({ data: { accepted: true, id: "tx-1", created: true } });
    await tap;

    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000);
    expect(readWidgetLastAction()?.kind).toBe("adding");
  });

  it("Undo ignores another account's last action", async () => {
    writeWidgetLastAction({
      kind: "added",
      userId: "user-b",
      id: "tx-1",
      key: "k",
      label: "Chai",
      amount: 20,
      at: T0,
      createdAt: T0,
    });
    await undoLastWidgetAction(redraw, T0 + 1000);
    expect(del).not.toHaveBeenCalled();
    expect(readWidgetLastAction()?.kind).toBe("added");
  });

  it("an undo that returns after a sign-out writes nothing", async () => {
    post.mockResolvedValueOnce({ data: { accepted: true, id: "tx-1", created: true } });
    await runWidgetPreset(0, redraw, T0);
    const gone = deferred<{ data: undefined }>();
    del.mockImplementationOnce(() => gone.promise as never);
    const undo = undoLastWidgetAction(redraw);
    await flush();

    signIn(null);
    gone.resolve({ data: undefined });
    await undo;

    expect(readWidgetLastAction()?.kind).toBe("added");
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1020);
  });
});

describe("a tap during a running drain", () => {
  it("is sent in the same pass", async () => {
    writeWidgetOutbox([queuedItem({ key: "k-older-00001", createdAt: T0 - 5000 })]);
    const first = deferred<{ data: unknown }>();
    post.mockImplementationOnce(() => first.promise as never);
    post.mockResolvedValue({ data: { accepted: true, id: "tx-2", created: true } });
    const running = drainWidgetOutbox(redraw);
    await flush();

    const tap = runWidgetPreset(1, redraw, T0);
    first.resolve({ data: { accepted: true, id: "tx-1", created: true } });
    await Promise.all([running, tap]);

    expect(post).toHaveBeenCalledTimes(2);
    expect(readWidgetOutbox()).toEqual([]);
    expect(readWidgetLastAction()).toMatchObject({ kind: "added", label: "Auto" });
  });
});
