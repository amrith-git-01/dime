import { randomUUID } from "expo-crypto";
import { copyAsync, deleteAsync } from "expo-file-system/legacy";

import { useOutboxStore } from "@/stores/outboxStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import {
  cancelPendingCreate,
  discardOutboxItem,
  editPendingCreate,
  enqueueCapture,
  enqueueManualTransaction,
  enqueueTransactionDelete,
  enqueueTransactionUpdate,
  expediteQueuedManualItems,
  retryOutboxItem,
} from "../outboxQueue";
import { loadOutboxItems } from "../outboxStorage";
import { requestOutboxDrain } from "../outboxSync";
import { MANUAL_BODY, NOW, manualItem } from "./fixtures";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "uuid-fixed") }));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
}));
jest.mock("@/lib/outbox/outboxSync", () => ({ requestOutboxDrain: jest.fn() }));
jest.mock("@/utils/deviceTimezone", () => ({ getDeviceIanaTimezone: () => "Asia/Kolkata" }));

const preview = manualItem().preview!;

beforeEach(() => {
  resetMockMmkv();
  jest.clearAllMocks();
  useOutboxStore.getState().reset();
});

describe("enqueueManualTransaction", () => {
  it("stores the entry with the idempotency key of the attempt that failed, and wakes the drain", () => {
    const item = enqueueManualTransaction({ userId: "u1", body: MANUAL_BODY, preview, idempotencyKey: "key-from-form", now: NOW });
    expect(item).toMatchObject({
      kind: "manual",
      idempotencyKey: "key-from-form",
      status: "queued",
      attempts: 0,
      nextAttemptAt: null,
      timezone: "Asia/Kolkata",
      createdAt: NOW,
      capturedAt: new Date(NOW).toISOString(),
      body: MANUAL_BODY,
    });
    expect(item.id).toMatch(/^optimistic-manual-/);
    expect(useOutboxStore.getState().items).toEqual([item]);
    expect(loadOutboxItems("u1")).toEqual([item]);
    expect(requestOutboxDrain).toHaveBeenCalledTimes(1);
  });

  it("makes a fresh key when none is given", () => {
    expect(enqueueManualTransaction({ userId: "u1", body: MANUAL_BODY, preview }).idempotencyKey).toBe("uuid-fixed");
  });
});

describe("enqueueTransactionUpdate and enqueueTransactionDelete", () => {
  it("queues an edit with only the changed fields and the updated_at it was made against", () => {
    const patch = { note: "edited offline", expected_updated_at: "2026-10-23T09:00:00.000Z" };
    const item = enqueueTransactionUpdate({ userId: "u1", targetId: "srv-9", patch, label: "Edit", now: NOW });
    expect(item).toMatchObject({ kind: "update", targetId: "srv-9", patch, label: "Edit", status: "queued", createdAt: NOW });
    expect(item.id).toMatch(/^optimistic-manual-/);
    expect(loadOutboxItems("u1")).toEqual([item]);
    expect(requestOutboxDrain).toHaveBeenCalledTimes(1);
  });

  it("queues a delete with the updated_at the user last saw", () => {
    const item = enqueueTransactionDelete({
      userId: "u1",
      targetId: "srv-9",
      expectedUpdatedAt: "2026-10-23T09:00:00.000Z",
      label: "Delete",
      now: NOW,
    });
    expect(item).toMatchObject({ kind: "delete", targetId: "srv-9", expectedUpdatedAt: "2026-10-23T09:00:00.000Z" });
    expect(loadOutboxItems("u1")).toEqual([item]);
  });

  it("a realtime insert does not make a queued edit due early (only waiting manual adds are expedited)", () => {
    const item = enqueueTransactionUpdate({ userId: "u1", targetId: "srv-9", patch: { expected_updated_at: "x" }, label: "Edit", now: NOW });
    useOutboxStore.getState().update(item.id, (current) => ({ ...current, nextAttemptAt: NOW + 60_000 }));
    jest.mocked(requestOutboxDrain).mockClear();
    expediteQueuedManualItems();
    expect(useOutboxStore.getState().items[0]?.nextAttemptAt).toBe(NOW + 60_000);
    expect(requestOutboxDrain).not.toHaveBeenCalled();
  });
});

describe("offline edits of the same row merge at enqueue", () => {
  const FIRST = "2026-10-23T09:00:00.000Z";
  const SECOND = "2026-10-23T09:05:00.000Z";

  // Each queued item needs its own id (the module-wide mock hands out one fixed uuid).
  beforeEach(() => {
    let n = 0;
    jest.mocked(randomUUID).mockImplementation((() => `uuid-${++n}`) as typeof randomUUID);
  });
  afterEach(() => {
    jest.mocked(randomUUID).mockImplementation((() => "uuid-fixed") as typeof randomUUID);
  });

  it("two updates become one: later fields win and the guard stays the first edit's expected_updated_at", () => {
    const first = enqueueTransactionUpdate({
      userId: "u1",
      targetId: "srv-9",
      patch: { note: "first", amount: "100.00", expected_updated_at: FIRST },
      label: "Edit one",
      now: NOW,
    });
    const second = enqueueTransactionUpdate({
      userId: "u1",
      targetId: "srv-9",
      patch: { note: "second", counterparty_name: "Zomato", expected_updated_at: SECOND },
      label: "Edit two",
      now: NOW + 1,
    });
    const items = useOutboxStore.getState().items;
    expect(items).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(items[0]).toMatchObject({
      kind: "update",
      targetId: "srv-9",
      label: "Edit two",
      patch: { note: "second", amount: "100.00", counterparty_name: "Zomato", expected_updated_at: FIRST },
    });
    expect(loadOutboxItems("u1")).toEqual(items);
  });

  it("does not merge edits of different rows, or into one that is already in flight", () => {
    enqueueTransactionUpdate({ userId: "u1", targetId: "srv-1", patch: { note: "a", expected_updated_at: FIRST }, label: "A", now: NOW });
    enqueueTransactionUpdate({ userId: "u1", targetId: "srv-2", patch: { note: "b", expected_updated_at: FIRST }, label: "B", now: NOW });
    expect(useOutboxStore.getState().items).toHaveLength(2);
    const sending = useOutboxStore.getState().items[0]!;
    useOutboxStore.getState().update(sending.id, (current) => ({ ...current, status: "sending" }));
    enqueueTransactionUpdate({ userId: "u1", targetId: "srv-1", patch: { note: "c", expected_updated_at: SECOND }, label: "C", now: NOW });
    expect(useOutboxStore.getState().items).toHaveLength(3);
  });

  it("a later category chosen by name replaces an earlier category id", () => {
    enqueueTransactionUpdate({
      userId: "u1",
      targetId: "srv-9",
      patch: { category_id: "cat-a", category: "A", expected_updated_at: FIRST },
      label: "Edit",
      now: NOW,
    });
    enqueueTransactionUpdate({
      userId: "u1",
      targetId: "srv-9",
      patch: { category: "Misc", expected_updated_at: SECOND },
      label: "Edit",
      now: NOW,
    });
    const patch = useOutboxStore.getState().items[0]!.patch!;
    expect(patch.category).toBe("Misc");
    expect(patch).not.toHaveProperty("category_id");
  });

  it("a delete replaces the pending edit of the row and keeps the edit's original expected_updated_at", () => {
    enqueueTransactionUpdate({ userId: "u1", targetId: "srv-9", patch: { note: "x", expected_updated_at: FIRST }, label: "Edit", now: NOW });
    enqueueTransactionUpdate({ userId: "u1", targetId: "srv-8", patch: { note: "y", expected_updated_at: FIRST }, label: "Other", now: NOW });
    const del = enqueueTransactionDelete({ userId: "u1", targetId: "srv-9", expectedUpdatedAt: SECOND, label: "Delete", now: NOW });
    const items = useOutboxStore.getState().items;
    expect(items.map((item) => [item.kind, item.targetId])).toEqual([
      ["update", "srv-8"],
      ["delete", "srv-9"],
    ]);
    expect(del.expectedUpdatedAt).toBe(FIRST);
    expect(loadOutboxItems("u1")).toEqual(items);
  });

  it("a second delete of the same row is not queued twice", () => {
    const first = enqueueTransactionDelete({ userId: "u1", targetId: "srv-9", expectedUpdatedAt: FIRST, label: "Delete", now: NOW });
    const again = enqueueTransactionDelete({ userId: "u1", targetId: "srv-9", expectedUpdatedAt: SECOND, label: "Delete", now: NOW });
    expect(again.id).toBe(first.id);
    expect(useOutboxStore.getState().items).toHaveLength(1);
  });
});

describe("edit and delete of an entry that is still a pending create", () => {
  it("an edit goes into the pending create's body and preview; no update is queued against the local id", () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "optimistic-manual-1" }));
    const result = editPendingCreate({
      userId: "u1",
      targetId: "optimistic-manual-1",
      patch: { amount: "300.00", note: "with friends", expected_updated_at: "2026-10-23T09:00:00.000Z" },
    });
    expect(result).toBe("edited");
    const [item] = useOutboxStore.getState().items;
    expect(useOutboxStore.getState().items).toHaveLength(1);
    expect(item!.body).toMatchObject({ amount: "300.00", note: "with friends", counterparty_name: "Swiggy" });
    expect(item!.body).not.toHaveProperty("expected_updated_at");
    expect(item!.preview).toMatchObject({ amount: "300.00", note: "with friends", category_icon_name: "Utensils" });
    expect(loadOutboxItems("u1")[0]).toEqual(item);
  });

  it("changing the category drops the old category's icon and colour from the preview", () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "optimistic-manual-1" }));
    editPendingCreate({
      userId: "u1",
      targetId: "optimistic-manual-1",
      patch: { category_id: "cat-fun", category: "Fun" },
    });
    const [item] = useOutboxStore.getState().items;
    expect(item!.body).toMatchObject({ category_id: "cat-fun", category: "Fun" });
    expect(item!.preview).toMatchObject({ category_id: "cat-fun", category: "Fun", category_icon_name: null, category_color: null });
  });

  it("a delete cancels the pending create (it leaves the outbox, so the overlay drops it too)", () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "optimistic-manual-1" }));
    expect(cancelPendingCreate("u1", "optimistic-manual-1")).toBe("cancelled");
    expect(useOutboxStore.getState().items).toEqual([]);
    expect(loadOutboxItems("u1")).toEqual([]);
  });

  it("a create that is in flight can neither take an edit nor be cancelled", () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "optimistic-manual-1", status: "sending" }));
    expect(editPendingCreate({ userId: "u1", targetId: "optimistic-manual-1", patch: { note: "x" } })).toBe("syncing");
    expect(cancelPendingCreate("u1", "optimistic-manual-1")).toBe("syncing");
    expect(useOutboxStore.getState().items[0]!.body).toEqual(MANUAL_BODY);
  });

  it("an id that is not a pending create is left alone", () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "optimistic-manual-1" }));
    expect(editPendingCreate({ userId: "u1", targetId: "srv-9", patch: { note: "x" } })).toBeNull();
    expect(cancelPendingCreate("u1", "srv-9")).toBeNull();
    expect(useOutboxStore.getState().items).toHaveLength(1);
  });
});

describe("enqueueCapture", () => {
  it("copies the recording into app storage and queues the copy with the capture time", async () => {
    const item = await enqueueCapture({
      userId: "u1",
      kind: "voice",
      sourceUri: "file:///cache/rec.m4a",
      fileName: "voice.m4a",
      mimeType: "audio/mp4",
      idempotencyKey: "voice-key",
      capturedAt: "2026-10-23T09:00:00.000Z",
      now: NOW,
    });
    expect(copyAsync).toHaveBeenCalledWith({ from: "file:///cache/rec.m4a", to: `file:///docs/outbox/${item.id}.m4a` });
    expect(item).toMatchObject({
      kind: "voice",
      idempotencyKey: "voice-key",
      capturedAt: "2026-10-23T09:00:00.000Z",
      file: { uri: `file:///docs/outbox/${item.id}.m4a`, name: "voice.m4a", mimeType: "audio/mp4" },
    });
    expect(loadOutboxItems("u1")).toHaveLength(1);
  });

  it("refuses to queue (with a message for the user) when the copy fails, instead of queueing a cache path", async () => {
    jest.mocked(copyAsync).mockRejectedValueOnce(new Error("disk full"));
    await expect(
      enqueueCapture({ userId: "u1", kind: "receipt", sourceUri: "file:///cache/photo.jpg", fileName: "receipt.jpg", mimeType: "image/jpeg" }),
    ).rejects.toThrow("Couldn't save the photo offline");
    jest.mocked(copyAsync).mockRejectedValueOnce(new Error("disk full"));
    await expect(
      enqueueCapture({ userId: "u1", kind: "voice", sourceUri: "file:///cache/rec.m4a", fileName: "voice.m4a", mimeType: "audio/mp4" }),
    ).rejects.toThrow("Couldn't save the voice note offline");
    expect(useOutboxStore.getState().items).toEqual([]);
    expect(requestOutboxDrain).not.toHaveBeenCalled();
  });
});

describe("expediteQueuedManualItems", () => {
  it("makes waiting manual items due now and wakes the drain (a realtime INSERT may be the same entry)", () => {
    useOutboxStore.getState().add("u1", manualItem({ id: "m", nextAttemptAt: NOW + 300_000, attempts: 5 }));
    useOutboxStore.getState().add("u1", manualItem({ id: "f", status: "failed", nextAttemptAt: null }));
    useOutboxStore.getState().add("u1", manualItem({ id: "b", status: "blocked", nextAttemptAt: NOW + 1 }));
    expediteQueuedManualItems();
    const items = useOutboxStore.getState().items;
    expect(items.find((i) => i.id === "m")?.nextAttemptAt).toBeNull();
    expect(items.find((i) => i.id === "b")?.nextAttemptAt).toBe(NOW + 1);
    expect(requestOutboxDrain).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no manual item is waiting", () => {
    useOutboxStore.getState().add("u1", manualItem({ status: "sending" }));
    expediteQueuedManualItems();
    expect(requestOutboxDrain).not.toHaveBeenCalled();
  });
});

describe("discard and retry", () => {
  it("discard removes the item and deletes only the copy this module made", async () => {
    const item = await enqueueCapture({
      userId: "u1",
      kind: "voice",
      sourceUri: "file:///cache/rec.m4a",
      fileName: "voice.m4a",
      mimeType: "audio/mp4",
    });
    discardOutboxItem(item.id);
    expect(useOutboxStore.getState().items).toEqual([]);
    expect(loadOutboxItems("u1")).toEqual([]);
    expect(deleteAsync).toHaveBeenCalledWith(item.file?.uri, { idempotent: true });
  });

  it("discard never deletes a file outside the outbox folder", () => {
    useOutboxStore.getState().add("u1", {
      ...manualItem({ id: "cap", kind: "voice" }),
      file: { uri: "file:///cache/rec.m4a", name: "voice.m4a", mimeType: "audio/mp4" },
    });
    discardOutboxItem("cap");
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it("retry puts a failed item back in the line and wakes the drain", () => {
    useOutboxStore.getState().add("u1", manualItem({ status: "failed", attempts: 3, lastError: "nope" }));
    retryOutboxItem("optimistic-manual-1");
    expect(useOutboxStore.getState().items[0]).toMatchObject({ status: "queued", attempts: 0, nextAttemptAt: null });
    expect(useOutboxStore.getState().items[0]?.lastError).toBeUndefined();
    expect(requestOutboxDrain).toHaveBeenCalled();
  });
});
