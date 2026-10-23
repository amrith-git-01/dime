import { randomUUID } from "expo-crypto";

import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import { createOptimisticManualTransactionId } from "@/features/transactions/optimistic/optimisticTransactionId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";
import { useOutboxStore } from "@/stores/outboxStore";

import { copyCaptureToOutbox, deleteOutboxFile } from "./outboxFiles";
import { itemForManualRetry } from "./outboxPolicy";
import {
  OUTBOX_ITEM_VERSION,
  type OutboxItem,
  type OutboxKind,
  type OutboxManualPreview,
} from "./outboxTypes";
import { requestOutboxDrain } from "./outboxSync";

/** A manual entry that could not be sent yet. `idempotencyKey` is the key the failed attempt used (if any). */
export function enqueueManualTransaction(input: {
  userId: string;
  body: CreateTransactionBody;
  preview: OutboxManualPreview;
  idempotencyKey?: string;
  now?: number;
}): OutboxItem {
  const now = input.now ?? Date.now();
  const item: OutboxItem = {
    v: OUTBOX_ITEM_VERSION,
    id: createOptimisticManualTransactionId(),
    kind: "manual",
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    createdAt: now,
    capturedAt: new Date(now).toISOString(),
    timezone: getDeviceIanaTimezone(),
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    body: input.body,
    preview: input.preview,
  };
  useOutboxStore.getState().add(input.userId, item);
  void requestOutboxDrain();
  return item;
}

/**
 * A voice note or receipt photo that could not be uploaded yet. The file is copied out of the
 * recorder's / camera's cache first (Android may clear those); if the copy fails the original path
 * is kept, which normally still exists for this session.
 */
export async function enqueueCapture(input: {
  userId: string;
  kind: Exclude<OutboxKind, "manual">;
  sourceUri: string;
  fileName: string;
  mimeType: string;
  idempotencyKey?: string;
  capturedAt?: string;
  now?: number;
}): Promise<OutboxItem> {
  const now = input.now ?? Date.now();
  const id = createOptimisticManualTransactionId();
  const copied = await copyCaptureToOutbox(
    input.sourceUri,
    { name: input.fileName, mimeType: input.mimeType },
    id,
  );
  if (!copied) {
    // The recorder's / camera's cache can be cleared by the OS at any time: queueing that path would
    // promise a sync that may never happen. Say so now, while the user can still try again.
    throw new Error(
      `Couldn't save the ${input.kind === "voice" ? "voice note" : "photo"} offline. Try again when you're connected.`,
    );
  }
  const item: OutboxItem = {
    v: OUTBOX_ITEM_VERSION,
    id,
    kind: input.kind,
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    createdAt: now,
    capturedAt: input.capturedAt ?? new Date(now).toISOString(),
    timezone: getDeviceIanaTimezone(),
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    file: copied,
  };
  useOutboxStore.getState().add(input.userId, item);
  void requestOutboxDrain();
  return item;
}

/**
 * A manual entry that was sent but whose answer never arrived (a timeout) can still land on the
 * server later; realtime then inserts that row while the same entry is still pending here, which
 * would show it twice and count it twice. So any realtime INSERT of a manual entry makes the waiting
 * manual items due now: the replay with their idempotency key returns the same saved row (or a 409
 * while the first request is still being processed) and the drain removes the item. The window of
 * a double row is one round trip.
 */
export function expediteQueuedManualItems(): void {
  const waiting = useOutboxStore
    .getState()
    .items.some((item) => item.kind === "manual" && item.status === "queued");
  if (!waiting) {
    return;
  }
  useOutboxStore
    .getState()
    .updateAll((item) =>
      item.kind === "manual" && item.status === "queued" ? { ...item, nextAttemptAt: null } : item,
    );
  void requestOutboxDrain();
}

/** Discard: the item and its saved file are gone for good. */
export function discardOutboxItem(id: string): void {
  const item = useOutboxStore.getState().items.find((candidate) => candidate.id === id);
  useOutboxStore.getState().remove(id);
  void deleteOutboxFile(item?.file?.uri);
}

/** Retry on a failed / blocked item: back in the line right away. */
export function retryOutboxItem(id: string): void {
  useOutboxStore.getState().update(id, itemForManualRetry);
  void requestOutboxDrain();
}
