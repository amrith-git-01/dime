import { budgetQueryKeys, categoryBudgetsQueryKeys } from "@/features/budgets/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview, TransactionRow } from "@/features/transactions/types";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { buildWidgetSnapshot } from "../buildWidgetSnapshot";

const USER = "user-a";
const TZ = "Asia/Kolkata";

function tx(id: string, overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id,
    user_id: USER,
    amount: "100.00",
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
    transaction_at: "2026-10-15T08:00:00Z",
    created_at: "2026-10-15T08:00:00Z",
    updated_at: "2026-10-15T08:00:00Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...overrides,
  };
}

const OVERVIEW: HomeOverview = {
  spent_today: "-250.00",
  spent_this_month: "-6177.50",
  fixed_spent_this_month: "2000.00",
  flexible_spent_this_month: "4177.50",
  top_categories: [
    { category_id: "cat-food", name: "Food", icon_name: "Utensils", color: "#112233", total: "3000.00" },
    { category_id: null, name: "Other", icon_name: null, color: null, total: "500.00" },
  ],
  recent_transactions: [
    tx("t1", { merchant: "Swiggy", amount: "-250.00" }),
    tx("t2", { counterparty_name: "  Rahul ", amount: "1000.00", type: "credit" }),
    tx("t3", { merchant: "", counterparty_name: null }),
    tx("t4", { merchant: "Fourth" }),
  ],
};

function seed(queryClient = createTestQueryClient()) {
  queryClient.setQueryData(transactionsQueryKeys.home(USER, TZ), OVERVIEW, {
    updatedAt: new Date(2026, 9, 15, 10, 0).getTime(),
  });
  queryClient.setQueryData(budgetQueryKeys.current(USER), {
    budget: {
      id: "b",
      user_id: USER,
      monthly_budget: "30000.00",
      created_at: "",
      updated_at: "",
    },
  });
  queryClient.setQueryData(categoryBudgetsQueryKeys.list(USER), [
    { category_id: "cat-food", monthly_amount: "5000.00" },
  ]);
  return queryClient;
}

describe("buildWidgetSnapshot", () => {
  it("returns null until the home overview is cached", () => {
    expect(
      buildWidgetSnapshot({ queryClient: createTestQueryClient(), userId: USER, timezone: TZ }),
    ).toBeNull();
  });

  it("builds month totals, split, budget and today from the cache", () => {
    const snapshot = buildWidgetSnapshot({ queryClient: seed(), userId: USER, timezone: TZ });
    expect(snapshot).toMatchObject({
      userId: USER,
      monthKey: "2026-10",
      dayKey: "2026-10-15",
      spentThisMonth: 6177.5,
      recurringSpent: 2000,
      flexibleSpent: 4177.5,
      monthlyBudget: 30000,
      budgetLeft: 23822.5,
      spentToday: 250,
    });
    expect(snapshot?.updatedAt).toBe(new Date(2026, 9, 15, 10, 0).getTime());
  });

  it("keeps up to three recent transactions with positive amounts and a display name", () => {
    const snapshot = buildWidgetSnapshot({ queryClient: seed(), userId: USER, timezone: TZ });
    expect(snapshot?.recentTransactions).toEqual([
      { id: "t1", name: "Swiggy", amount: 250, type: "debit" },
      { id: "t2", name: "Rahul", amount: 1000, type: "credit" },
      { id: "t3", name: "—", amount: 100, type: "debit" },
    ]);
  });

  it("joins top categories with their category budget", () => {
    const snapshot = buildWidgetSnapshot({ queryClient: seed(), userId: USER, timezone: TZ });
    expect(snapshot?.topCategories).toEqual([
      { id: "cat-food", name: "Food", color: "#112233", iconName: "Utensils", spent: 3000, budget: 5000 },
      { id: "__uncategorized__", name: "Other", color: null, iconName: null, spent: 500, budget: null },
    ]);
  });

  it("has no budget when none is cached or set", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(transactionsQueryKeys.home(USER, TZ), OVERVIEW);
    queryClient.setQueryData(budgetQueryKeys.current(USER), { budget: null });
    const snapshot = buildWidgetSnapshot({ queryClient, userId: USER, timezone: TZ });
    expect(snapshot?.monthlyBudget).toBeNull();
    expect(snapshot?.budgetLeft).toBeNull();
  });

  it("never reads another user's cache", () => {
    expect(
      buildWidgetSnapshot({ queryClient: seed(), userId: "user-b", timezone: TZ }),
    ).toBeNull();
  });
});
