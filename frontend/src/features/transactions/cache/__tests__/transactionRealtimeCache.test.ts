import { QueryClient } from "@tanstack/react-query";

import { categoriesQueryKeys } from "@/features/categories/queryKeys";
import type { CategoryRow } from "@/features/categories/types";

import type { TransactionRow } from "../../types";
import { fillRealtimeRowCategory } from "../transactionRealtimeCache";

function category(over: Partial<CategoryRow>): CategoryRow {
  return {
    id: "c1",
    name: "Food",
    icon_name: "Utensils",
    color: "#111111",
    is_system: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function row(over: Partial<TransactionRow>): TransactionRow {
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
    ...over,
  };
}

describe("fillRealtimeRowCategory", () => {
  it("fills name, icon and colour from a spend category", () => {
    const qc = new QueryClient();
    qc.setQueryData(categoriesQueryKeys.list("u1", "spend"), [category({})]);
    const filled = fillRealtimeRowCategory(qc, "u1", row({ category_id: "c1" }));
    expect(filled).toMatchObject({
      category: "Food",
      category_icon_name: "Utensils",
      category_color: "#111111",
    });
  });

  it("resolves a recurring-scoped category cached under another scope", () => {
    const qc = new QueryClient();
    qc.setQueryData(categoriesQueryKeys.list("u1", "spend"), [category({})]);
    qc.setQueryData(categoriesQueryKeys.list("u1", "recurring_income"), [
      category({ id: "c9", name: "Salary", icon_name: "Wallet", color: "#222222" }),
    ]);
    const filled = fillRealtimeRowCategory(qc, "u1", row({ category_id: "c9" }));
    expect(filled.category).toBe("Salary");
    expect(filled.category_icon_name).toBe("Wallet");
  });

  it("leaves the row alone when the category is not cached, has a name already, or has no id", () => {
    const qc = new QueryClient();
    qc.setQueryData(categoriesQueryKeys.list("u1", "spend"), [category({})]);
    const unknown = row({ category_id: "zzz" });
    expect(fillRealtimeRowCategory(qc, "u1", unknown)).toBe(unknown);
    const named = row({ category_id: "c1", category: "Custom" });
    expect(fillRealtimeRowCategory(qc, "u1", named)).toBe(named);
    const none = row({});
    expect(fillRealtimeRowCategory(qc, "u1", none)).toBe(none);
  });

  it("ignores another user's cached categories", () => {
    const qc = new QueryClient();
    qc.setQueryData(categoriesQueryKeys.list("u2", "spend"), [category({})]);
    const r = row({ category_id: "c1" });
    expect(fillRealtimeRowCategory(qc, "u1", r)).toBe(r);
  });
});
