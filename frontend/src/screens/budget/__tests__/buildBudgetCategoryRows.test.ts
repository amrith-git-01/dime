import type { CategoryRow } from "@/features/categories/types";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import type { MonthSummaryCategoryMeta } from "@/features/transactions/types";

import { buildBudgetCategoryRows } from "../buildBudgetCategoryRows";

const food: CategoryRow = {
  id: "food",
  name: "Food",
  icon_name: "Utensils",
  color: "#111111",
  is_system: true,
  scope: "spend",
  created_at: "2026-01-01T00:00:00Z",
};

const meta = (
  over: Partial<MonthSummaryCategoryMeta>,
): MonthSummaryCategoryMeta => ({
  id: "rent",
  name: "Rent",
  icon_name: "Home",
  color: "#222222",
  scope: "recurring_expense",
  ...over,
});

describe("buildBudgetCategoryRows", () => {
  it("lists spend categories and uncategorized spend", () => {
    const rows = buildBudgetCategoryRows({
      categories: [food],
      spendByCategory: { food: 300, [UNCATEGORIZED_CATEGORY_KEY]: 50 },
      categoryCapById: new Map([["food", 1000]]),
      spentCategoryMetaById: new Map(),
    });
    expect(rows.map((r) => [r.id, r.spentMonth, r.monthlyCap])).toEqual([
      ["food", 300, 1000],
      [UNCATEGORIZED_CATEGORY_KEY, 50, null],
    ]);
  });

  it("leaves out spend in recurring-scoped categories (it lives in the Recurring sections)", () => {
    const rows = buildBudgetCategoryRows({
      categories: [food],
      spendByCategory: { food: 300, rent: 15000, pay: 10 },
      categoryCapById: new Map(),
      spentCategoryMetaById: new Map([
        ["rent", meta({})],
        ["pay", meta({ id: "pay", name: "Salary", scope: "recurring_income" })],
      ]),
    });
    expect(rows.map((r) => r.id)).toEqual(["food"]);
  });

  it("still shows a spent category known by meta but missing from the list, and unknown ids", () => {
    const rows = buildBudgetCategoryRows({
      categories: [food],
      spendByCategory: { food: 1, old: 20, ghost: 10 },
      categoryCapById: new Map(),
      spentCategoryMetaById: new Map([
        ["old", meta({ id: "old", name: "Old", scope: "spend" })],
      ]),
    });
    expect(rows.map((r) => [r.id, r.name, r.budgetEditable])).toEqual([
      ["old", "Old", false],
      ["ghost", "Unknown category", undefined],
      ["food", "Food", undefined],
    ]);
  });
});
