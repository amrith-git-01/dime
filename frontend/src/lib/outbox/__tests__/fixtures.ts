import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";

import type { OutboxItem } from "../outboxTypes";

export const NOW = Date.parse("2026-10-23T10:00:00.000Z");

export const MANUAL_BODY: CreateTransactionBody = {
  amount: "250.00",
  type: "debit",
  counterparty_name: "Swiggy",
  counterparty_type: "merchant",
  category: "Food",
  category_id: "cat-food",
  note: null,
  transaction_at: "2026-10-23T09:30:00.000Z",
};

export function manualItem(over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    v: 1,
    id: "optimistic-manual-1",
    kind: "manual",
    idempotencyKey: "key-1",
    createdAt: NOW - 60_000,
    capturedAt: "2026-10-23T09:59:00.000Z",
    timezone: "Asia/Kolkata",
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    body: MANUAL_BODY,
    preview: {
      amount: "250.00",
      type: "debit",
      counterparty_name: "Swiggy",
      counterparty_type: "merchant",
      category: "Food",
      category_id: "cat-food",
      category_icon_name: "Utensils",
      category_color: "teal",
      transaction_at: "2026-10-23T09:30:00.000Z",
      note: null,
    },
    ...over,
  };
}

export function voiceItem(over: Partial<OutboxItem> = {}): OutboxItem {
  return {
    v: 1,
    id: "optimistic-manual-2",
    kind: "voice",
    idempotencyKey: "key-2",
    createdAt: NOW - 120_000,
    capturedAt: "2026-10-23T09:58:00.000Z",
    timezone: "Asia/Kolkata",
    status: "queued",
    attempts: 0,
    nextAttemptAt: null,
    file: { uri: "file:///docs/outbox/optimistic-manual-2.m4a", name: "voice.m4a", mimeType: "audio/mp4" },
    ...over,
  };
}
