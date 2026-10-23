import { copyAsync, deleteAsync } from "expo-file-system/legacy";

import { useOutboxStore } from "@/stores/outboxStore";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { discardOutboxItem, enqueueCapture, enqueueManualTransaction, expediteQueuedManualItems, retryOutboxItem } from "../outboxQueue";
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
