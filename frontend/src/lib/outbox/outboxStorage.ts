import { createMMKV } from "react-native-mmkv";

import { OUTBOX_ITEM_VERSION, type OutboxItem } from "./outboxTypes";

/**
 * Its own MMKV instance, deliberately not part of the `rq-cache` blob: the query cache is rebuilt
 * on every app update (cache buster) and trimmed to a size budget, while the outbox holds the only
 * copy of writes that never reached the server.
 */
const outboxMmkv = createMMKV({ id: "dime-outbox" });

const keyFor = (userId: string): string => `outbox.v${OUTBOX_ITEM_VERSION}:${userId}`;

const KINDS = new Set(["manual", "voice", "receipt"]);
const STATUSES = new Set(["queued", "sending", "failed", "blocked"]);

function isOutboxItem(value: unknown): value is OutboxItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Partial<OutboxItem>;
  return (
    item.v === OUTBOX_ITEM_VERSION &&
    typeof item.id === "string" &&
    typeof item.idempotencyKey === "string" &&
    typeof item.kind === "string" &&
    KINDS.has(item.kind) &&
    typeof item.status === "string" &&
    STATUSES.has(item.status) &&
    typeof item.createdAt === "number" &&
    typeof item.capturedAt === "string" &&
    typeof item.timezone === "string" &&
    typeof item.attempts === "number" &&
    (item.kind === "manual" ? typeof item.body === "object" && item.body !== null : typeof item.file?.uri === "string")
  );
}

/**
 * The user's pending writes, oldest first. Never throws: unreadable JSON is an empty outbox and an
 * item of another version / shape is skipped. An item left `sending` by an app kill is `queued` again.
 */
export function loadOutboxItems(userId: string): OutboxItem[] {
  try {
    const raw = outboxMmkv.getString(keyFor(userId));
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isOutboxItem)
      .map((item) => (item.status === "sending" ? { ...item, status: "queued" as const } : item));
  } catch {
    return [];
  }
}

export function saveOutboxItems(userId: string, items: readonly OutboxItem[]): void {
  try {
    if (items.length === 0) {
      outboxMmkv.remove(keyFor(userId));
      return;
    }
    outboxMmkv.set(keyFor(userId), JSON.stringify(items));
  } catch {
    /* storage full / unavailable: the in-memory outbox still works for this session */
  }
}

/** Every user's outbox (sign-out, user switch, wipe). */
export function clearOutboxStorage(): void {
  try {
    outboxMmkv.clearAll();
  } catch {
    /* nothing to clear */
  }
}
