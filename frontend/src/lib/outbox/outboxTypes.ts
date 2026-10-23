import type { CounterpartyType } from "@/features/transactions/counterpartyTypes";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import type { TransactionType } from "@/features/transactions/types";

/**
 * One write that has not reached the server yet. Versioned (`v`) so a later shape can be told
 * apart: items of an unknown version are dropped on load rather than guessed at.
 */
export const OUTBOX_ITEM_VERSION = 1;

export type OutboxKind = "manual" | "voice" | "receipt";

/**
 * - `queued`: waiting for its turn / connection / backoff.
 * - `sending`: an upload is in flight (an app kill leaves it here; load turns it back into `queued`).
 * - `failed`: the server refused it (4xx) or it is too old; needs the user (Retry / Discard).
 * - `blocked`: the daily capture limit was reached; retried automatically after the reset.
 */
export type OutboxStatus = "queued" | "sending" | "failed" | "blocked";

/** Capture file copied into app storage (recorder / manipulator outputs live in cache dirs Android may clear). */
export type OutboxFile = {
  uri: string;
  name: string;
  mimeType: string;
};

/** What a TransactionRow needs to render a not-yet-synced manual entry. */
export type OutboxManualPreview = {
  amount: string;
  type: TransactionType;
  counterparty_name: string;
  counterparty_type: CounterpartyType;
  category: string | null;
  category_id: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  transaction_at: string;
  note: string | null;
};

export type OutboxItem = {
  v: typeof OUTBOX_ITEM_VERSION;
  /** Local id (an `optimistic-manual-…` uuid) so it can never collide with a server id. */
  id: string;
  kind: OutboxKind;
  /** The same key on every attempt: the server answers a repeat with the first result. */
  idempotencyKey: string;
  /** Epoch ms. */
  createdAt: number;
  /** ISO instant the user captured it; sent as `captured_at` for voice / receipt. */
  capturedAt: string;
  timezone: string;
  status: OutboxStatus;
  attempts: number;
  /** Epoch ms of the next try; null = as soon as possible. */
  nextAttemptAt: number | null;
  lastError?: string;
  /** manual only. */
  body?: CreateTransactionBody;
  /** voice / receipt only. */
  file?: OutboxFile;
  /** manual only. */
  preview?: OutboxManualPreview;
};
