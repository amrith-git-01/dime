import type { CategoryRow } from "@/features/categories/types";

import type { TransactionRow } from "../../types";
import {
  reconcileEditCategory,
  recurringCategoryOfTransaction,
  visibleSpendCategories,
} from "../manualAddCategoryUtils";

function cat(over: Partial<CategoryRow>): CategoryRow {
  return {
    id: "food",
    name: "Food",
    icon_name: "Utensils",
    color: "#111111",
    is_system: true,
    scope: "spend",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function tx(over: Partial<TransactionRow>): TransactionRow {
  return {
    id: "t1",
    user_id: "u1",
    amount: "10.00",
    type: "debit",
    counterparty_name: "Netflix",
    counterparty_type: "merchant",
    counterparty_normalized: null,
    merchant: "Netflix",
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

const FOOD = cat({});
const INCOME = cat({ id: "income", name: "Income" });
const SPEND = [FOOD, INCOME];

const subs = tx({
  category_id: "subs",
  category: "Subscriptions",
  category_icon_name: "Repeat",
  category_color: "#222222",
});
const salary = tx({
  type: "credit",
  category_id: "salary",
  category: "Salary",
  category_icon_name: "Wallet",
  category_color: "#333333",
});

describe("recurringCategoryOfTransaction", () => {
  it("builds a category from the row's own fields, scoped by its type", () => {
    expect(recurringCategoryOfTransaction(subs, SPEND)).toMatchObject({
      id: "subs",
      name: "Subscriptions",
      icon_name: "Repeat",
      color: "#222222",
      scope: "recurring_expense",
    });
    expect(recurringCategoryOfTransaction(salary, SPEND)?.scope).toBe(
      "recurring_income",
    );
  });

  it("is null for a listed category, an uncategorized row or no row", () => {
    expect(
      recurringCategoryOfTransaction(
        tx({ category_id: "food", category: "Food" }),
        SPEND,
      ),
    ).toBeNull();
    expect(recurringCategoryOfTransaction(tx({}), SPEND)).toBeNull();
    expect(recurringCategoryOfTransaction(undefined, SPEND)).toBeNull();
  });
});

describe("visibleSpendCategories", () => {
  it("expense: spend pills without Income; income: just Income", () => {
    expect(visibleSpendCategories(SPEND, "debit").map((c) => c.id)).toEqual(["food"]);
    expect(visibleSpendCategories(SPEND, "credit").map((c) => c.id)).toEqual(["income"]);
  });
});

describe("reconcileEditCategory", () => {
  const expense = recurringCategoryOfTransaction(subs, SPEND);
  const income = recurringCategoryOfTransaction(salary, SPEND);

  it("keeps a recurring category whose scope matches the type", () => {
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "subs",
        txType: "debit",
        recurringCategory: expense,
      }),
    ).toEqual({ kind: "keep" });
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "salary",
        txType: "credit",
        recurringCategory: income,
      }),
    ).toEqual({ kind: "keep" });
  });

  it("switching a recurring expense to income falls back to Income", () => {
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "subs",
        txType: "credit",
        recurringCategory: expense,
      }),
    ).toEqual({ kind: "select", category: INCOME });
  });

  it("switching recurring income to expense clears the category", () => {
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "salary",
        txType: "debit",
        recurringCategory: income,
      }),
    ).toEqual({ kind: "clear" });
  });

  it("does not treat an id outside the row's own recurring category as recurring", () => {
    const base = { categories: SPEND, recurringCategory: null };
    expect(reconcileEditCategory({ ...base, categoryId: "rent", txType: "debit" })).toEqual({ kind: "keep" });
    expect(reconcileEditCategory({ ...base, categoryId: "rent", txType: "credit" })).toEqual({ kind: "keep" });
  });

  it("drops an id outside the list once the row's type was switched", () => {
    const base = { categories: SPEND, categoryId: "gone", recurringCategory: null };
    expect(reconcileEditCategory({ ...base, txType: "debit", originalType: "credit" })).toEqual({ kind: "clear" });
    expect(reconcileEditCategory({ ...base, txType: "credit", originalType: "debit" })).toEqual({
      kind: "select",
      category: INCOME,
    });
    expect(reconcileEditCategory({ ...base, txType: "debit", originalType: "debit" })).toEqual({ kind: "keep" });
  });

  it("keeps an unknown non-recurring id and a normal spend category", () => {
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "new-custom",
        txType: "debit",
        recurringCategory: null,
      }),
    ).toEqual({ kind: "keep" });
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "food",
        txType: "debit",
        recurringCategory: null,
      }),
    ).toEqual({ kind: "keep" });
  });

  it("moves a spend category to Income when switching to income, and waits for categories", () => {
    expect(
      reconcileEditCategory({
        categories: SPEND,
        categoryId: "food",
        txType: "credit",
        recurringCategory: null,
      }),
    ).toEqual({ kind: "select", category: INCOME });
    expect(
      reconcileEditCategory({
        categories: [],
        categoryId: "subs",
        txType: "credit",
        recurringCategory: expense,
      }),
    ).toEqual({ kind: "keep" });
  });
});
