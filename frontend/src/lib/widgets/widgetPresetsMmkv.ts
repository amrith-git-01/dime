import { createMMKV } from "react-native-mmkv";

import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";

/**
 * One-tap presets, the outbox of taps not yet sent, and the last action the widgets report. All
 * user data: cleared on sign-out with the rest of the app's MMKV (`clearAppDataMmkv`). Read in the
 * headless widget task, so this module must stay free of React and navigation imports.
 */
const presetsMmkv = createMMKV({ id: "widget-presets" });

const PRESETS_KEY = "dime:widget-presets";
const OUTBOX_KEY = "dime:widget-outbox";
const LAST_ACTION_KEY = "dime:widget-last-action";

export const MAX_WIDGET_PRESETS = 3;
export const MAX_WIDGET_PRESET_LABEL_LENGTH = 14;

export type WidgetPreset = {
  label: string;
  /** Rupees. */
  amount: number;
  categoryId: string;
};

/** A preset tap that has to reach the server. `key` is its Idempotency-Key, reused on every retry. */
export type WidgetOutboxItem = {
  key: string;
  userId: string;
  body: CreateTransactionBody;
  label: string;
  amount: number;
  /** Epoch ms of the tap. */
  createdAt: number;
  /** Undo was tapped while this was being sent: delete the transaction as soon as it lands. */
  undoRequested?: boolean;
};

/** What the widgets last did on the user's behalf. */
export type WidgetLastAction = {
  kind:
    | "adding"
    | "added"
    | "duplicate"
    | "queued"
    | "failed"
    | "signedOut"
    | "undoing"
    | "undone"
    | "undoFailed";
  /** The account this is about; another account's last action is never shown or undone. */
  userId: string;
  /** The outbox key of the tap this is about; the target of Undo. */
  key?: string;
  /** Server id of the created transaction, when the server returned one (absent on old replays). */
  id?: string;
  label: string;
  amount: number;
  /** Epoch ms this status was set (how long it stays on the status line). */
  at: number;
  /** Epoch ms of the tap itself: the Undo window and the snapshot day/month are judged from it. */
  createdAt: number;
};

/** Undo is offered this long after a preset was added or queued. */
export const WIDGET_UNDO_WINDOW_MS = 2 * 60_000;

function readJson<T>(key: string): T | null {
  const raw = presetsMmkv.getString(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isPreset(value: unknown): value is WidgetPreset {
  const preset = value as Partial<WidgetPreset> | null;
  return (
    !!preset &&
    typeof preset.label === "string" &&
    typeof preset.categoryId === "string" &&
    typeof preset.amount === "number" &&
    Number.isFinite(preset.amount) &&
    preset.amount > 0
  );
}

/** The signed-in user's presets, in tap order. */
export function readWidgetPresets(userId: string | undefined): WidgetPreset[] {
  const stored = readJson<{ userId: string; presets: unknown[] }>(PRESETS_KEY);
  if (!userId || !stored || stored.userId !== userId || !Array.isArray(stored.presets)) {
    return [];
  }
  return stored.presets.filter(isPreset).slice(0, MAX_WIDGET_PRESETS);
}

export function writeWidgetPresets(userId: string, presets: WidgetPreset[]): void {
  presetsMmkv.set(
    PRESETS_KEY,
    JSON.stringify({ userId, presets: presets.slice(0, MAX_WIDGET_PRESETS) }),
  );
}

export function readWidgetOutbox(): WidgetOutboxItem[] {
  const items = readJson<WidgetOutboxItem[]>(OUTBOX_KEY);
  return Array.isArray(items) ? items : [];
}

export function writeWidgetOutbox(items: WidgetOutboxItem[]): void {
  if (items.length === 0) {
    presetsMmkv.remove(OUTBOX_KEY);
    return;
  }
  presetsMmkv.set(OUTBOX_KEY, JSON.stringify(items));
}

export function readWidgetLastAction(): WidgetLastAction | null {
  return readJson<WidgetLastAction>(LAST_ACTION_KEY);
}

export function writeWidgetLastAction(action: WidgetLastAction | null): void {
  if (!action) {
    presetsMmkv.remove(LAST_ACTION_KEY);
    return;
  }
  presetsMmkv.set(LAST_ACTION_KEY, JSON.stringify(action));
}

/** Sets or clears `undoRequested` on a queued tap. */
export function markOutboxItemUndoRequested(key: string): void {
  writeWidgetOutbox(
    readWidgetOutbox().map((item) =>
      item.key === key ? { ...item, undoRequested: true } : item,
    ),
  );
}

/** Sign-out: presets, queued taps and the status line belong to the previous user. */
export function clearWidgetPresetData(): void {
  presetsMmkv.remove(PRESETS_KEY);
  presetsMmkv.remove(OUTBOX_KEY);
  presetsMmkv.remove(LAST_ACTION_KEY);
}

/** Whether the status line still offers Undo for `action`. */
export function canUndoWidgetAction(
  action: WidgetLastAction | null,
  now: number = Date.now(),
): action is WidgetLastAction {
  if (!action || now - action.createdAt > WIDGET_UNDO_WINDOW_MS) {
    return false;
  }
  if (action.kind === "queued") {
    return true;
  }
  // An old replay has no id to delete by, so there is nothing to undo.
  return (
    (action.kind === "added" || action.kind === "undoFailed") &&
    Boolean(action.id)
  );
}
