import { createMMKV, deleteMMKV, existsMMKV } from "react-native-mmkv";

import { postManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import { getSession } from "@/lib/auth/session";
import { reportError } from "@/lib/reportError";

/** The 1.1.0 widgets kept one-tap presets and a queue of unsent taps here. 1.2.0 has neither. */
const LEGACY_PRESETS_MMKV_ID = "widget-presets";
const LEGACY_OUTBOX_KEY = "dime:widget-outbox";
const SEND_TIMEOUT_MS = 5_000;
const MAX_SENT = 10;

/** A 1.1.0 tap that never reached the server. `key` is its Idempotency-Key, so a resend cannot double it. */
type LegacyOutboxItem = { key: string; userId: string; body: CreateTransactionBody; undoRequested?: boolean };

/**
 * Sends the taps 1.1.0 still had queued (best effort, once, short timeout; the current account's only,
 * and not ones the user had asked to undo), then deletes the old store from disk. Later calls find
 * nothing and do nothing. Never throws.
 */
export async function removeLegacyWidgetPresets(): Promise<void> {
  if (!existsMMKV(LEGACY_PRESETS_MMKV_ID)) {
    return;
  }
  try {
    const raw = createMMKV({ id: LEGACY_PRESETS_MMKV_ID }).getString(LEGACY_OUTBOX_KEY);
    const items: LegacyOutboxItem[] = raw ? (JSON.parse(raw) as LegacyOutboxItem[]) : [];
    const userId = getSession()?.user.id;
    const sendable = items
      .filter((item) => item.userId === userId && !item.undoRequested)
      .slice(0, MAX_SENT);
    await Promise.allSettled(
      sendable.map((item) => postManualTransaction(item.body, item.key, { timeout: SEND_TIMEOUT_MS })),
    );
  } catch (error) {
    reportError(error, "legacy widget outbox could not be sent");
  } finally {
    deleteMMKV(LEGACY_PRESETS_MMKV_ID);
  }
}
