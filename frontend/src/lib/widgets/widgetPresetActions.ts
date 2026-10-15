import { isAxiosError } from "axios";
import { randomUUID } from "expo-crypto";

import { postManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import {
  deleteTransaction,
  type CreateTransactionBody,
} from "@/features/transactions/api/transactionsApi";
import { getSession } from "@/lib/auth/session";
import { reportError } from "@/lib/reportError";
import { paiseToAmountString, toPaise } from "@/utils/paise";
import { refreshWidgets } from "@/widgets/refreshWidgets";

import {
  canUndoWidgetAction,
  markOutboxItemUndoRequested,
  readWidgetLastAction,
  readWidgetOutbox,
  readWidgetPresets,
  writeWidgetLastAction,
  writeWidgetOutbox,
  type WidgetLastAction,
  type WidgetOutboxItem,
} from "./widgetPresetsMmkv";
import { readWidgetSnapshot } from "./widgetSnapshotMmkv";
import { bumpWidgetSnapshot } from "./widgetSnapshotBump";

/** A second tap on the same preset inside this window is ignored (an impatient double tap). */
export const WIDGET_DOUBLE_TAP_GUARD_MS = 3_000;
/** One request. The widget task is killed after 30 s, so a hung connection must not use it all. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Everything one drain may spend, token refresh included, well under the 30 s task limit. */
const DRAIN_BUDGET_MS = 20_000;

type SendResult =
  | { kind: "ok"; id?: string; created?: boolean }
  /** Offline, timed out, or a server hiccup: keep it queued. */
  | { kind: "retry" }
  /** The server refused it for good (validation, unknown category). */
  | { kind: "rejected" }
  | { kind: "unauthorized" };

/** 408 / 409 (same key still processing) / 429 say "later", not "never". */
const RETRYABLE_CLIENT_STATUSES = new Set([408, 409, 429]);

function classifyError(error: unknown): SendResult {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401) {
    return { kind: "unauthorized" };
  }
  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    !RETRYABLE_CLIENT_STATUSES.has(status)
  ) {
    return { kind: "rejected" };
  }
  return { kind: "retry" };
}

async function sendOutboxItem(
  item: WidgetOutboxItem,
  signal: AbortSignal,
): Promise<SendResult> {
  try {
    const { id, created } = await postManualTransaction(item.body, item.key, {
      timeout: REQUEST_TIMEOUT_MS,
      signal,
    });
    return {
      kind: "ok",
      ...(id ? { id } : {}),
      ...(created !== undefined ? { created } : {}),
    };
  } catch (error) {
    return classifyError(error);
  }
}

/** "deleted": 2xx. "gone": 404, the row was already removed. "failed": could not tell. */
async function deleteCreated(id: string): Promise<"deleted" | "gone" | "failed"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    await deleteTransaction(id, {
      timeout: REQUEST_TIMEOUT_MS,
      signal: controller.signal,
    });
    return "deleted";
  } catch (error) {
    return isAxiosError(error) && error.response?.status === 404 ? "gone" : "failed";
  } finally {
    clearTimeout(timer);
  }
}

function currentUserId(): string | undefined {
  return getSession()?.user.id;
}

// The app runtime listens for this to refetch what the widgets just changed on the server.
const changeListeners = new Set<() => void>();

/** Called after the widgets added or deleted a transaction. Returns unsubscribe. */
export function onWidgetTransactionsChanged(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function notifyChanged(): void {
  for (const listener of [...changeListeners]) {
    try {
      listener();
    } catch (error) {
      reportError(error, "widget change listener failed");
    }
  }
}

type ActionItem = {
  key?: string;
  userId: string;
  label: string;
  amount: number;
  createdAt: number;
};

function setLastAction(
  kind: WidgetLastAction["kind"],
  item: ActionItem,
  extra: { id?: string; at?: number } = {},
): void {
  writeWidgetLastAction({
    kind,
    userId: item.userId,
    label: item.label,
    amount: item.amount,
    createdAt: item.createdAt,
    at: extra.at ?? Date.now(),
    ...(item.key ? { key: item.key } : {}),
    ...(extra.id ? { id: extra.id } : {}),
  });
}

/** A drain reporting an older tap must not replace the status of a newer one. */
function setDrainStatus(kind: WidgetLastAction["kind"], item: ActionItem, id?: string): void {
  const current = readWidgetLastAction();
  if (
    current &&
    current.userId === item.userId &&
    current.key !== item.key &&
    current.createdAt > item.createdAt
  ) {
    return;
  }
  setLastAction(kind, item, id ? { id } : {});
}

function removeFromOutbox(key: string): void {
  writeWidgetOutbox(readWidgetOutbox().filter((item) => item.key !== key));
}

// Keys whose request is on the wire right now (this runtime), and the keys the last pass tried.
const inFlight = new Set<string>();
let lastPassAttempted = new Set<string>();
let draining: Promise<number> | null = null;

async function runDrain(redraw: () => void): Promise<number> {
  let changed = 0;
  const attempted = new Set<string>();
  lastPassAttempted = attempted;
  const controller = new AbortController();
  const budget = setTimeout(() => controller.abort(), DRAIN_BUDGET_MS);
  try {
    // Re-read each round: a tap that lands while this runs joins the same pass.
    for (;;) {
      const item = readWidgetOutbox().find(
        (candidate) => !attempted.has(candidate.key),
      );
      if (!item) {
        break;
      }
      attempted.add(item.key);
      const userId = currentUserId();
      if (!userId) {
        setDrainStatus("signedOut", item);
        redraw();
        break;
      }
      // Queued under another account: it is not this user's to send.
      if (item.userId !== userId) {
        removeFromOutbox(item.key);
        continue;
      }

      inFlight.add(item.key);
      let result: SendResult;
      try {
        result = await sendOutboxItem(item, controller.signal);
      } finally {
        inFlight.delete(item.key);
      }
      // Signed out or switched while the request was out: write nothing for the old account.
      if (currentUserId() !== item.userId) {
        break;
      }
      const queued = readWidgetOutbox().find((candidate) => candidate.key === item.key);
      if (!queued) {
        continue;
      }
      const undoRequested = queued.undoRequested === true;

      if (result.kind === "ok") {
        removeFromOutbox(item.key);
        changed += 1;
        const spend = {
          userId: item.userId,
          id: result.id ?? item.key,
          name: item.label,
          amount: item.amount,
          at: item.createdAt,
        };
        if (result.created === false) {
          // The server already had this payment: nothing of ours to bump or undo.
          setDrainStatus("duplicate", item);
        } else if (undoRequested && result.id) {
          // Undo was tapped while this was in flight: take it straight back out.
          const outcome = await deleteCreated(result.id);
          if (currentUserId() !== item.userId) {
            break;
          }
          if (outcome === "failed") {
            bumpWidgetSnapshot(spend, "add");
            setDrainStatus("undoFailed", item, result.id);
          } else {
            setDrainStatus("undone", item);
          }
        } else {
          bumpWidgetSnapshot(spend, "add");
          setDrainStatus("added", item, result.id);
        }
        notifyChanged();
        redraw();
        continue;
      }
      if (result.kind === "rejected") {
        removeFromOutbox(item.key);
        setDrainStatus(undoRequested ? "undone" : "failed", item);
        redraw();
        continue;
      }
      if (result.kind === "unauthorized") {
        setDrainStatus("signedOut", item);
        redraw();
        break;
      }
      // Retry later; the taps behind it still get their turn in this pass.
      setDrainStatus(undoRequested ? "undoing" : "queued", item);
      redraw();
    }
  } catch (error) {
    reportError(error, "widget outbox drain failed");
  } finally {
    clearTimeout(budget);
  }
  return changed;
}

/**
 * Sends the queued preset taps, oldest first. One drain at a time (callers share it), each
 * request with a 10 s timeout and the whole pass capped at 20 s. Safe to call with an empty
 * outbox: it then does nothing, not even a network call. Resolves with how many were settled.
 */
export function drainWidgetOutbox(
  redraw: () => void = refreshWidgets,
): Promise<number> {
  if (!draining) {
    draining = runDrain(redraw).finally(() => {
      draining = null;
    });
  }
  return draining;
}

const lastTapAt = new Map<number, number>();

/** Test hook: forget the double-tap history and in-flight bookkeeping. */
export function resetWidgetTapGuard(): void {
  lastTapAt.clear();
  inFlight.clear();
  lastPassAttempted = new Set();
}

function presetBody(
  preset: { label: string; amount: number; categoryId: string },
  at: number,
): CreateTransactionBody {
  return {
    amount: paiseToAmountString(toPaise(preset.amount)),
    type: "debit",
    counterparty_name: preset.label,
    counterparty_type: "merchant",
    category: null,
    category_id: preset.categoryId,
    note: null,
    transaction_at: new Date(at).toISOString(),
  };
}

/**
 * A tap on preset `index` of Quick add, run headless: queue it first (so nothing is lost if the
 * process dies mid-request), show "Adding...", then send. The outcome reaches the widgets'
 * status line through `redraw`.
 */
export async function runWidgetPreset(
  index: number,
  redraw: () => void = refreshWidgets,
  now: number = Date.now(),
): Promise<void> {
  const session = getSession();
  if (!session) {
    writeWidgetLastAction({
      kind: "signedOut",
      userId: readWidgetSnapshot()?.userId ?? "",
      label: "",
      amount: 0,
      at: now,
      createdAt: now,
    });
    redraw();
    return;
  }
  const preset = readWidgetPresets(session.user.id)[index];
  if (!preset) {
    return;
  }
  const previousTap = lastTapAt.get(index);
  if (
    previousTap !== undefined &&
    now - previousTap < WIDGET_DOUBLE_TAP_GUARD_MS
  ) {
    return;
  }
  lastTapAt.set(index, now);

  const item: WidgetOutboxItem = {
    key: randomUUID(),
    userId: session.user.id,
    body: presetBody(preset, now),
    label: preset.label,
    amount: preset.amount,
    createdAt: now,
  };
  writeWidgetOutbox([...readWidgetOutbox(), item]);
  setLastAction("adding", item, { at: now });
  redraw();

  await drainWidgetOutbox(redraw);
  // The pass we joined may have ended before this tap was queued: give it its own.
  if (
    readWidgetOutbox().some((queued) => queued.key === item.key) &&
    !lastPassAttempted.has(item.key)
  ) {
    await drainWidgetOutbox(redraw);
  }
}

/**
 * Undo of the last preset action: take it back out of the outbox if it never left; if it is on
 * the wire, flag it so it is deleted the moment it lands; else delete the transaction it created
 * (a 404 means it is already gone, so the snapshot, which already excludes it, is left alone).
 */
export async function undoLastWidgetAction(
  redraw: () => void = refreshWidgets,
  now: number = Date.now(),
): Promise<void> {
  const action = readWidgetLastAction();
  const userId = currentUserId();
  if (!userId || !action || action.userId !== userId || !canUndoWidgetAction(action, now)) {
    return;
  }
  const item: ActionItem = {
    userId,
    label: action.label,
    amount: action.amount,
    createdAt: action.createdAt,
    ...(action.key ? { key: action.key } : {}),
  };

  const queued = action.key
    ? readWidgetOutbox().find((candidate) => candidate.key === action.key)
    : undefined;
  if (queued) {
    if (inFlight.has(queued.key)) {
      markOutboxItemUndoRequested(queued.key);
      setLastAction("undoing", item);
    } else {
      removeFromOutbox(queued.key);
      setLastAction("undone", item);
    }
    redraw();
    return;
  }
  if (!action.id) {
    return;
  }

  const outcome = await deleteCreated(action.id);
  if (currentUserId() !== userId) {
    return;
  }
  if (outcome === "failed") {
    // Keep the original time and id: Undo stays available for the rest of its window.
    setLastAction("undoFailed", item, { id: action.id, at: action.at });
    redraw();
    return;
  }
  if (outcome === "deleted") {
    bumpWidgetSnapshot(
      {
        userId,
        id: action.id,
        name: action.label,
        amount: action.amount,
        at: action.createdAt,
      },
      "remove",
    );
  }
  setLastAction("undone", item);
  notifyChanged();
  redraw();
}
