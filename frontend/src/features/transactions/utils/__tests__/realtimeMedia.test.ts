import type { TransactionRow } from "../../types";
import { reconcileRealtimeMedia } from "../realtimeMedia";

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: "t1",
    user_id: "u1",
    amount: "10.00",
    type: "debit",
    counterparty_name: null,
    counterparty_type: "merchant",
    counterparty_normalized: null,
    merchant: "",
    category: null,
    category_id: null,
    category_icon_name: null,
    category_color: null,
    note: null,
    detected_via: null,
    transaction_at: "2026-08-15T08:00:00Z",
    created_at: "2026-08-15T08:00:00Z",
    updated_at: "2026-08-15T08:00:00Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...overrides,
  };
}

describe("reconcileRealtimeMedia", () => {
  const signed = "https://storage.example.com/receipts/a.jpg?token=abc";

  it("keeps the cached signed url when the payload carries a raw path", () => {
    const merged = reconcileRealtimeMedia(
      row({ receipt_url: "u1/receipts/a.jpg" }),
      row({ receipt_url: signed }),
    );
    expect(merged.receipt_url).toBe(signed);
  });

  it("drops a raw path when nothing signed is cached", () => {
    const merged = reconcileRealtimeMedia(
      row({ voice_url: "u1/voice/a.m4a" }),
      undefined,
    );
    expect(merged.voice_url).toBeNull();
  });

  it("accepts an incoming signed url and an explicit null", () => {
    expect(
      reconcileRealtimeMedia(row({ receipt_url: signed }), undefined)
        .receipt_url,
    ).toBe(signed);
    expect(
      reconcileRealtimeMedia(row({ receipt_url: null }), row({ receipt_url: signed }))
        .receipt_url,
    ).toBeNull();
  });

  it("returns the same object when nothing changes", () => {
    const incoming = row({});
    expect(reconcileRealtimeMedia(incoming, undefined)).toBe(incoming);
  });
});
