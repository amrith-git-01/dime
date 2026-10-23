import { resetMockMmkv } from "@/test-utils/mockMmkv";
import { useOutboxStore } from "@/stores/outboxStore";

import { bumpUserDataEpoch } from "@/lib/userDataEpoch";

import { SubmitError } from "../failure";
import { loadOutboxItems } from "../outboxStorage";
import { createOutboxDrain, type OutboxSyncDeps } from "../outboxSync";
import { MAX_ITEM_AGE_MS, TOO_OLD_MESSAGE } from "../outboxPolicy";
import { manualItem, NOW, voiceItem } from "./fixtures";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(), fetch: jest.fn() },
}));
jest.mock("@/lib/reportError", () => ({ reportError: jest.fn() }));
jest.mock("@/features/transactions/api/submitTransactionApi", () => ({
  submitManualTransaction: jest.fn(),
  submitReceipt: jest.fn(),
  submitVoice: jest.fn(),
}));
jest.mock("@/stores/authSessionStore", () => {
  const { create } = jest.requireActual("zustand");
  return { useAuthSessionStore: create(() => ({ session: null, userId: "u1" })) };
});

type Deps = jest.Mocked<OutboxSyncDeps>;

function makeDeps(over: Partial<OutboxSyncDeps> = {}): Deps {
  return {
    now: jest.fn(() => NOW),
    isOnline: jest.fn(() => true),
    sendManual: jest.fn().mockResolvedValue({ id: "srv-1", created: true }),
    sendCapture: jest.fn().mockResolvedValue({ jobId: "job-1" }),
    fileExists: jest.fn().mockResolvedValue(true),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    onSynced: jest.fn(),
    ...over,
  } as Deps;
}

const items = () => useOutboxStore.getState().items;
const byId = (id: string) => items().find((item) => item.id === id);

beforeEach(() => {
  resetMockMmkv();
  useOutboxStore.getState().reset();
  useOutboxStore.getState().hydrate("u1");
});

describe("outbox drain", () => {
  it("sends manual entries in order with the stored key and timezone, then removes them", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "a", createdAt: NOW - 2000, idempotencyKey: "ka" }));
    useOutboxStore.getState().add("u1", manualItem({ id: "b", createdAt: NOW - 1000, idempotencyKey: "kb" }));
    const deps = makeDeps();
    await createOutboxDrain(deps).drain();

    expect(deps.sendManual.mock.calls.map(([item]) => item.idempotencyKey)).toEqual(["ka", "kb"]);
    expect(items()).toEqual([]);
    expect(deps.onSynced).toHaveBeenCalledTimes(2);
    expect(loadOutboxItems("u1")).toEqual([]);
    expect(useOutboxStore.getState().syncing).toBe(false);
  });

  it("uploads a voice note with its file, then deletes the file", async () => {
    useOutboxStore.getState().add("u1", voiceItem());
    const deps = makeDeps();
    await createOutboxDrain(deps).drain();
    expect(deps.sendCapture).toHaveBeenCalledTimes(1);
    expect(deps.deleteFile).toHaveBeenCalledWith("file:///docs/outbox/optimistic-manual-2.m4a");
    expect(items()).toEqual([]);
  });

  it("does nothing while offline", async () => {
    useOutboxStore.getState().add("u1", manualItem());
    const deps = makeDeps({ isOnline: jest.fn(() => false) });
    await createOutboxDrain(deps).drain();
    expect(deps.sendManual).not.toHaveBeenCalled();
    expect(byId("optimistic-manual-1")?.status).toBe("queued");
  });

  it("an unreachable server ends the pass and gives every other waiting item the same wait", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "a", createdAt: NOW - 3000 }));
    useOutboxStore.getState().add("u1", manualItem({ id: "b", createdAt: NOW - 2000 }));
    useOutboxStore.getState().add("u1", voiceItem({ id: "c", createdAt: NOW - 1000 }));
    const deps = makeDeps({
      sendManual: jest.fn().mockRejectedValue(new SubmitError("timeout", { networkFailure: true })),
    });
    await createOutboxDrain(deps).drain();

    expect(deps.sendManual).toHaveBeenCalledTimes(1);
    expect(byId("a")).toMatchObject({ status: "queued", attempts: 1, nextAttemptAt: NOW + 5_000, lastError: "timeout" });
    expect(byId("b")).toMatchObject({ status: "queued", attempts: 0, nextAttemptAt: NOW + 5_000 });
    expect(byId("c")).toMatchObject({ status: "queued", attempts: 0, nextAttemptAt: NOW + 5_000 });
    // Still on disk, same key.
    expect(loadOutboxItems("u1").find((i) => i.id === "a")?.idempotencyKey).toBe("key-1");
  });

  it("one item the server refuses does not block the rest", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "bad", createdAt: NOW - 2000 }));
    useOutboxStore.getState().add("u1", manualItem({ id: "good", createdAt: NOW - 1000 }));
    const deps = makeDeps({
      sendManual: jest
        .fn()
        .mockRejectedValueOnce(new SubmitError("Input should be greater than 0", { status: 422 }))
        .mockResolvedValueOnce({ id: "srv" }),
    });
    await createOutboxDrain(deps).drain();
    expect(byId("bad")).toMatchObject({ status: "failed", lastError: "Input should be greater than 0", nextAttemptAt: null });
    expect(byId("good")).toBeUndefined();
  });

  it("a 5xx is retried later without stopping the pass", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "a", createdAt: NOW - 2000 }));
    useOutboxStore.getState().add("u1", manualItem({ id: "b", createdAt: NOW - 1000 }));
    const deps = makeDeps({
      sendManual: jest
        .fn()
        .mockRejectedValueOnce(new SubmitError("Bad gateway", { status: 502 }))
        .mockResolvedValueOnce({}),
    });
    await createOutboxDrain(deps).drain();
    expect(byId("a")).toMatchObject({ status: "queued", attempts: 1, nextAttemptAt: NOW + 5_000 });
    expect(byId("b")).toBeUndefined();
  });

  it("the daily limit blocks the capture until the reset and keeps its file", async () => {
    useOutboxStore.getState().add("u1", voiceItem());
    const deps = makeDeps({
      sendCapture: jest
        .fn()
        .mockRejectedValue(new SubmitError("You've used today's 10 voice captures. Try again tomorrow.", { status: 429, retryAfterSeconds: 3600 })),
    });
    await createOutboxDrain(deps).drain();
    expect(byId("optimistic-manual-2")).toMatchObject({ status: "blocked", nextAttemptAt: NOW + 3_600_000 + 60_000 });
    expect(deps.deleteFile).not.toHaveBeenCalled();
  });

  it("a blocked item is tried again once its time has come", async () => {
    useOutboxStore.getState().add("u1", voiceItem({ status: "blocked", nextAttemptAt: NOW - 1 }));
    const deps = makeDeps();
    await createOutboxDrain(deps).drain();
    expect(deps.sendCapture).toHaveBeenCalledTimes(1);
    expect(items()).toEqual([]);
  });

  it("items that are not due yet, or failed, are left alone", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "later", nextAttemptAt: NOW + 10_000 }));
    useOutboxStore.getState().add("u1", manualItem({ id: "failed", status: "failed" }));
    const deps = makeDeps();
    await createOutboxDrain(deps).drain();
    expect(deps.sendManual).not.toHaveBeenCalled();
  });

  it("an item older than 30 days is failed as too old without being sent", async () => {
    useOutboxStore.getState().add("u1", manualItem({ createdAt: NOW - MAX_ITEM_AGE_MS - 1 }));
    const deps = makeDeps();
    await createOutboxDrain(deps).drain();
    expect(deps.sendManual).not.toHaveBeenCalled();
    expect(byId("optimistic-manual-1")).toMatchObject({ status: "failed", lastError: TOO_OLD_MESSAGE });
  });

  it("a capture whose saved file is gone fails instead of retrying forever", async () => {
    useOutboxStore.getState().add("u1", voiceItem());
    const deps = makeDeps({ fileExists: jest.fn().mockResolvedValue(false) });
    await createOutboxDrain(deps).drain();
    expect(deps.sendCapture).not.toHaveBeenCalled();
    expect(byId("optimistic-manual-2")?.status).toBe("failed");
  });

  it("is single-flight: a second call during a run does not upload twice, and picks up what arrived meanwhile", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "a", createdAt: NOW - 2000 }));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeDeps({
      sendManual: jest.fn(async () => {
        await gate;
        return {};
      }),
    });
    const drain = createOutboxDrain(deps);
    const first = drain.drain();
    const second = drain.drain();
    useOutboxStore.getState().add("u1", manualItem({ id: "b", createdAt: NOW - 1000 }));
    release();
    await Promise.all([first, second]);
    expect(deps.sendManual).toHaveBeenCalledTimes(2);
    expect(items()).toEqual([]);
  });

  it("marks an item 'sending' while it uploads", async () => {
    useOutboxStore.getState().add("u1", manualItem());
    let seen: string | undefined;
    const deps = makeDeps({
      sendManual: jest.fn(async () => {
        seen = byId("optimistic-manual-1")?.status;
        return {};
      }),
    });
    await createOutboxDrain(deps).drain();
    expect(seen).toBe("sending");
  });

  it("hands each upload the user it is for and an abort signal", async () => {
    useOutboxStore.getState().add("u1", manualItem());
    const deps = makeDeps();
    await createOutboxDrain(deps).drain();
    const [, context] = deps.sendManual.mock.calls[0]!;
    expect(context.userId).toBe("u1");
    expect(context.signal.aborted).toBe(false);
  });

  it("a wipe (sign-out / user switch) during an upload aborts it and drops the answer: no cache patch, no store write", async () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "a", createdAt: NOW - 2000 }));
    useOutboxStore.getState().add("u1", manualItem({ id: "b", createdAt: NOW - 1000 }));
    let signal: AbortSignal | undefined;
    const deps = makeDeps({
      sendManual: jest.fn(async (_item, context) => {
        signal = context.signal;
        // The account is switched while the request is in flight; its answer still arrives.
        bumpUserDataEpoch();
        useOutboxStore.getState().reset();
        useOutboxStore.getState().hydrate("u2");
        return { id: "srv", transaction: undefined };
      }),
    });
    await createOutboxDrain(deps).drain();
    expect(signal?.aborted).toBe(true);
    expect(deps.onSynced).not.toHaveBeenCalled();
    expect(deps.sendManual).toHaveBeenCalledTimes(1); // the pass ended; B's outbox is untouched
    expect(useOutboxStore.getState().userId).toBe("u2");
    expect(useOutboxStore.getState().items).toEqual([]);
    expect(loadOutboxItems("u2")).toEqual([]);
  });

  it("a failure that arrives after the wipe is dropped too (no retry bookkeeping on the new account)", async () => {
    useOutboxStore.getState().add("u1", voiceItem());
    const deps = makeDeps({
      sendCapture: jest.fn(async () => {
        bumpUserDataEpoch();
        useOutboxStore.getState().reset();
        useOutboxStore.getState().hydrate("u2");
        throw new SubmitError("Bad gateway", { status: 502 });
      }),
    });
    await createOutboxDrain(deps).drain();
    expect(deps.deleteFile).not.toHaveBeenCalled();
    expect(useOutboxStore.getState().items).toEqual([]);
  });

  it("a 401 that survives the refresh fails the item with a sign-in message", async () => {
    useOutboxStore.getState().add("u1", manualItem());
    const deps = makeDeps({ sendManual: jest.fn().mockRejectedValue(new SubmitError("Not authenticated.", { status: 401 })) });
    await createOutboxDrain(deps).drain();
    expect(byId("optimistic-manual-1")).toMatchObject({ status: "failed", lastError: "Sign in again to sync", nextAttemptAt: null });
  });
});
