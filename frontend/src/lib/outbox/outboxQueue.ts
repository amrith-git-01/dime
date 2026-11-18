import { randomUUID } from "expo-crypto";

import type {
  CreateTransactionBody,
  UpdateTransactionBody,
} from "@/features/transactions/api/transactionsApi";
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

/**
 * The edit's fields laid over an earlier pending edit of the same row: later fields win, and the guard stays the
 * FIRST edit's `expected_updated_at` (the version both were made against; the replay must not carry a stale one).
 */
function mergeUpdatePatches(
  earlier: UpdateTransactionBody,
  later: UpdateTransactionBody,
): UpdateTransactionBody {
  const merged: UpdateTransactionBody = { ...earlier };
  for (const [key, value] of Object.entries(later)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  // A category chosen by name alone replaces an earlier id (the pair always travels together).
  if (later.category !== undefined && later.category_id === undefined) {
    delete merged.category_id;
  }
  const guard = earlier.expected_updated_at ?? later.expected_updated_at;
  if (guard !== undefined) {
    merged.expected_updated_at = guard;
  }
  return merged;
}

/** A queued (not in flight, not failed) edit / delete of the row, oldest first. */
function queuedMutationsFor(targetId: string, kind: "update" | "delete"): OutboxItem[] {
  return useOutboxStore
    .getState()
    .items.filter(
      (item) => item.kind === kind && item.targetId === targetId && item.status === "queued",
    );
}

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
 * An edit of a transaction the server has, made offline (or when the server could not be reached). `patch` holds
 * only the changed fields and the `expected_updated_at` the edit was made against; the replay is dropped, with a
 * toast, when the row changed elsewhere meanwhile.
 */
export function enqueueTransactionUpdate(input: {
  userId: string;
  targetId: string;
  patch: UpdateTransactionBody;
  label: string;
  now?: number;
}): OutboxItem {
  const now = input.now ?? Date.now();
  useOutboxStore.getState().hydrate(input.userId);
  // A second offline edit of the same row joins the first instead of queuing behind it with a stale guard.
  const [pending] = queuedMutationsFor(input.targetId, "update");
  if (pending?.patch) {
    const merged: OutboxItem = {
      ...pending,
      patch: mergeUpdatePatches(pending.patch, input.patch),
      label: input.label,
    };
    useOutboxStore.getState().update(pending.id, () => merged);
    void requestOutboxDrain();
    return merged;
  }
  const item: OutboxItem = {
    v: OUTBOX_ITEM_VERSION,
    id: createOptimisticManualTransactionId(),
    kind: "update",
    idempotencyKey: randomUUID(),
    createdAt: now,
    capturedAt: new Date(now).toISOString(),
    timezone: getDeviceIanaTimezone(),
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    targetId: input.targetId,
    patch: input.patch,
    label: input.label,
  };
  useOutboxStore.getState().add(input.userId, item);
  void requestOutboxDrain();
  return item;
}

/** A delete made offline: replayed with the `updated_at` the user last saw, dropped when the row has moved on. */
export function enqueueTransactionDelete(input: {
  userId: string;
  targetId: string;
  expectedUpdatedAt: string | null;
  label: string;
  now?: number;
}): OutboxItem {
  const now = input.now ?? Date.now();
  useOutboxStore.getState().hydrate(input.userId);
  const [alreadyDeleting] = queuedMutationsFor(input.targetId, "delete");
  if (alreadyDeleting) {
    return alreadyDeleting;
  }
  // The delete replaces the edits waiting for the same row (they would only be dropped as stale once it lands),
  // and keeps the version the first of them was made against.
  const replaced = queuedMutationsFor(input.targetId, "update");
  const expectedUpdatedAt = replaced[0]?.patch?.expected_updated_at ?? input.expectedUpdatedAt;
  for (const edit of replaced) {
    useOutboxStore.getState().remove(edit.id);
  }
  const item: OutboxItem = {
    v: OUTBOX_ITEM_VERSION,
    id: createOptimisticManualTransactionId(),
    kind: "delete",
    idempotencyKey: randomUUID(),
    createdAt: now,
    capturedAt: new Date(now).toISOString(),
    timezone: getDeviceIanaTimezone(),
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    targetId: input.targetId,
    expectedUpdatedAt,
    label: input.label,
  };
  useOutboxStore.getState().add(input.userId, item);
  void requestOutboxDrain();
  return item;
}

/** The waiting manual entry whose local id is `targetId` (a row that is still a pending create), if any. */
function pendingCreateFor(userId: string, targetId: string): OutboxItem | undefined {
  useOutboxStore.getState().hydrate(userId);
  return useOutboxStore
    .getState()
    .items.find((item) => item.kind === "manual" && item.id === targetId);
}

/**
 * An edit of an entry that is still waiting to be created: the server has no row to PATCH (its id is the local
 * one), so the change goes into the pending create's body and preview. `syncing`: that create is in flight right
 * now, so it can neither take the change nor be cancelled; the caller asks the user to retry in a moment.
 * `null`: `targetId` is not a pending create.
 */
export function editPendingCreate(input: {
  userId: string;
  targetId: string;
  patch: UpdateTransactionBody;
}): "edited" | "syncing" | null {
  const item = pendingCreateFor(input.userId, input.targetId);
  if (!item?.body) {
    return null;
  }
  if (item.status === "sending") {
    return "syncing";
  }
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input.patch)) {
    if (key !== "expected_updated_at" && value !== undefined) {
      fields[key] = value;
    }
  }
  const body = { ...item.body, ...fields } as CreateTransactionBody;
  const sameCategory = (body.category_id ?? null) === (item.body.category_id ?? null);
  const preview: OutboxManualPreview = {
    ...(item.preview ?? ({} as OutboxManualPreview)),
    amount: body.amount,
    type: body.type,
    ...(body.kind ? { kind: body.kind } : {}),
    counterparty_name: body.counterparty_name,
    counterparty_type: body.counterparty_type,
    category: body.category,
    category_id: body.category_id ?? null,
    category_icon_name: sameCategory ? (item.preview?.category_icon_name ?? null) : null,
    category_color: sameCategory ? (item.preview?.category_color ?? null) : null,
    transaction_at: body.transaction_at,
    note: body.note,
  };
  useOutboxStore.getState().update(item.id, (current) => ({ ...current, body, preview }));
  return "edited";
}

/** A delete of an entry that is still waiting to be created: the create is cancelled, nothing reaches the server. */
export function cancelPendingCreate(userId: string, targetId: string): "cancelled" | "syncing" | null {
  const item = pendingCreateFor(userId, targetId);
  if (!item) {
    return null;
  }
  if (item.status === "sending") {
    return "syncing";
  }
  useOutboxStore.getState().remove(item.id);
  return "cancelled";
}

/**
 * A voice note or receipt photo that could not be uploaded yet. The file is copied out of the
 * recorder's / camera's cache first (Android may clear those); if the copy fails the original path
 * is kept, which normally still exists for this session.
 */
export async function enqueueCapture(input: {
  userId: string;
  kind: Extract<OutboxKind, "voice" | "receipt">;
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
