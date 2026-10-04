import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";

import {
  applyTransactionInsertToListCaches,
  applyTransactionRemoveFromListCaches,
  findTransactionInListCaches,
  applyTransactionUpdateToListCaches,
} from "@/features/transactions/cache/transactionListCache";
import type { CounterpartyType } from "@/features/transactions/counterpartyTypes";
import type { TransactionRow } from "@/features/transactions/types";
import { reconcileRealtimeMedia } from "@/features/transactions/utils/realtimeMedia";
import { normalizeTransactionAmount } from "@/utils/transactionAmount";

type TransactionDbRecord = Record<string, unknown>;

const COUNTERPARTY_TYPES = new Set<CounterpartyType>([
  "merchant",
  "person",
  "self_transfer",
  "unknown",
]);

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCounterpartyType(value: unknown): CounterpartyType {
  if (typeof value === "string") {
    const stripped = value.trim() as CounterpartyType;
    if (COUNTERPARTY_TYPES.has(stripped)) {
      return stripped;
    }
  }
  return "merchant";
}

/** Map a Supabase realtime row payload into a list ``TransactionRow``. */
export function mapRealtimeRecordToTransactionRow(
  record: TransactionDbRecord,
): TransactionRow | null {
  const id = asString(record.id);
  const user_id = asString(record.user_id);
  if (!id || !user_id) {
    return null;
  }

  const counterparty_name = asNullableString(record.counterparty_name);
  const merchant =
    counterparty_name && counterparty_name.length > 0 ? counterparty_name : "";

  return {
    id,
    user_id,
    amount: normalizeTransactionAmount(record.amount),
    type: record.type === "credit" ? "credit" : "debit",
    counterparty_name,
    counterparty_type: normalizeCounterpartyType(record.counterparty_type),
    counterparty_normalized: asNullableString(record.counterparty_normalized),
    merchant,
    category: asNullableString(record.category),
    category_id: asNullableString(record.category_id),
    category_icon_name: asNullableString(record.category_icon_name),
    category_color: asNullableString(record.category_color),
    note: asNullableString(record.note),
    detected_via: asNullableString(record.detected_via),
    transaction_at: asString(record.transaction_at) ?? new Date().toISOString(),
    created_at: asString(record.created_at) ?? new Date().toISOString(),
    updated_at: asString(record.updated_at) ?? new Date().toISOString(),
    deleted_at: asNullableString(record.deleted_at),
    receipt_url: asNullableString(record.receipt_url),
    voice_url: asNullableString(record.voice_url),
  };
}

function isSoftDeleted(row: TransactionRow): boolean {
  return row.deleted_at != null && row.deleted_at.length > 0;
}

/** Id of the transaction a realtime payload is about, or null if it has none. */
export function realtimePayloadTransactionId(
  payload: RealtimePostgresChangesPayload<TransactionDbRecord>,
): string | null {
  const record = payload.eventType === "DELETE" ? payload.old : payload.new;
  return asString((record as TransactionDbRecord | undefined)?.id);
}

export function applyRealtimeTransactionChange(
  queryClient: QueryClient,
  input: {
    userId: string;
    timezone: string;
    payload: RealtimePostgresChangesPayload<TransactionDbRecord>;
  },
): void {
  const { userId, timezone, payload } = input;

  if (payload.eventType === "DELETE") {
    const id = asString(payload.old.id);
    if (!id) {
      return;
    }
    applyTransactionRemoveFromListCaches(queryClient, {
      userId,
      timezone,
      transactionId: id,
    });
    return;
  }

  const mapped = mapRealtimeRecordToTransactionRow(payload.new);
  if (!mapped) {
    return;
  }
  // Realtime carries raw storage paths in receipt_url/voice_url (C7): never let them replace
  // a signed URL that is already cached.
  const row = reconcileRealtimeMedia(
    mapped,
    findTransactionInListCaches(queryClient, {
      userId,
      timezone,
      transactionId: mapped.id,
    }),
  );

  if (isSoftDeleted(row)) {
    applyTransactionRemoveFromListCaches(queryClient, {
      userId,
      timezone,
      transactionId: row.id,
    });
    return;
  }

  if (payload.eventType === "INSERT") {
    applyTransactionInsertToListCaches(queryClient, { userId, timezone, row });
    return;
  }

  if (payload.eventType === "UPDATE") {
    applyTransactionUpdateToListCaches(queryClient, { userId, timezone, row });
  }
}
