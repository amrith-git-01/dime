import { categoryBudgetsQueryKeys } from "@/features/budgets/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview, TransactionRow } from "@/features/transactions/types";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { buildWidgetSnapshot, buildWidgetSnapshotFromData } from "../buildWidgetSnapshot";

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
  // The server's budget picture: recurring items are committed (outside the budget) by default.
  budget_spent: "4177.50",
  budget_left: "25822.50",
  committed_total: "2000.00",
  monthly_budget: "30000.00",
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

  it("builds month totals, split and budget from the cache", () => {
    const snapshot = buildWidgetSnapshot({ queryClient: seed(), userId: USER, timezone: TZ });
    expect(snapshot).toMatchObject({
      userId: USER,
      monthKey: "2026-10",
      spentThisMonth: 6177.5,
      recurringSpent: 2000,
      flexibleSpent: 4177.5,
      budgetSpent: 4177.5,
      committed: 2000,
      monthlyBudget: 30000,
      budgetLeft: 25822.5,
    });
    expect(snapshot?.updatedAt).toBe(new Date(2026, 9, 15, 10, 0).getTime());
  });

  it("joins top categories with their category budget", () => {
    const snapshot = buildWidgetSnapshot({ queryClient: seed(), userId: USER, timezone: TZ });
    expect(snapshot?.topCategories).toEqual([
      { id: "cat-food", name: "Food", color: "#112233", iconName: "Utensils", spent: 3000, budget: 5000 },
      { id: "__uncategorized__", name: "Other", color: null, iconName: null, spent: 500, budget: null },
    ]);
  });

  it("has no budget when the month has no cap", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      transactionsQueryKeys.home(USER, TZ),
      { ...OVERVIEW, monthly_budget: null, budget_left: null },
      { updatedAt: new Date(2026, 9, 15, 10, 0).getTime() },
    );
    const snapshot = buildWidgetSnapshot({ queryClient, userId: USER, timezone: TZ });
    expect(snapshot?.monthlyBudget).toBeNull();
    expect(snapshot?.budgetLeft).toBeNull();
  });

  it("keeps the server's signed left when over budget: negative, never clamped to zero", () => {
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      transactionsQueryKeys.home(USER, TZ),
      { ...OVERVIEW, budget_spent: "32500.00", budget_left: "-2500.00" },
      { updatedAt: new Date(2026, 9, 15, 10, 0).getTime() },
    );
    const snapshot = buildWidgetSnapshot({ queryClient, userId: USER, timezone: TZ });
    expect(snapshot).toMatchObject({ budgetSpent: 32500, budgetLeft: -2500, monthlyBudget: 30000 });
  });

  it("never reads another user's cache", () => {
    expect(
      buildWidgetSnapshot({ queryClient: seed(), userId: "user-b", timezone: TZ }),
    ).toBeNull();
  });
});

describe("buildWidgetSnapshotFromData", () => {
  const AT = new Date(2026, 9, 15, 10, 0).getTime();

  it("builds the same snapshot from plain API data, with no query cache", () => {
    const fromData = buildWidgetSnapshotFromData({
      userId: USER,
      updatedAt: AT,
      overview: OVERVIEW,
      categoryBudgets: [{ category_id: "cat-food", monthly_amount: "5000.00" }],
    });
    expect(fromData).toEqual(buildWidgetSnapshot({ queryClient: seed(), userId: USER, timezone: TZ }));
  });

  it("has no budget without one, and keeps at most three categories", () => {
    const snapshot = buildWidgetSnapshotFromData({
      userId: USER,
      updatedAt: AT,
      overview: {
        ...OVERVIEW,
        monthly_budget: null,
        budget_left: null,
        top_categories: ["a", "b", "c", "d"].map((id) => ({
          category_id: id,
          name: id,
          icon_name: null,
          color: null,
          total: "10.00",
        })),
      },
      categoryBudgets: [],
    });
    expect(snapshot.monthlyBudget).toBeNull();
    expect(snapshot.budgetLeft).toBeNull();
    expect(snapshot.topCategories.map((category) => category.id)).toEqual(["a", "b", "c"]);
    expect(snapshot.monthKey).toBe("2026-10");
  });
});
