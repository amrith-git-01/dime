import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";

import { buildCategoryBudgetsModel } from "../categoryBudgetsModel";

const NOW = new Date(2026, 9, 15, 12, 0);

function snapshot(
  topCategories: WidgetSnapshot["topCategories"],
  overrides: Partial<WidgetSnapshot> = {},
): WidgetSnapshot {
  return {
    version: 2,
    userId: "user-a",
    updatedAt: NOW.getTime(),
    monthKey: "2026-10",
    dayKey: "2026-10-15",
    spentThisMonth: 0,
    recurringSpent: 0,
    flexibleSpent: 0,
    monthlyBudget: null,
    budgetLeft: null,
    spentToday: 0,
    recentTransactions: [],
    topCategories,
    recurring: [],
    ...overrides,
  };
}

const FOOD = { id: "food", name: "Food", color: "#112233", iconName: null, spent: 1535, budget: 5000 };
const FUEL = { id: "fuel", name: "Fuel", color: "#bad", iconName: null, spent: 3000, budget: null };
const FUN = { id: "fun", name: "Fun", color: null, iconName: null, spent: 600, budget: 500 };

describe("buildCategoryBudgetsModel", () => {
  it("prompts to sign in without a snapshot", () => {
    const model = buildCategoryBudgetsModel(null, NOW);
    expect(model.signedOut).toBe(true);
    expect(model.message).toBe("Sign in to Dime");
  });

  it("shows spent of cap with progress against the cap", () => {
    const [row] = buildCategoryBudgetsModel(snapshot([FOOD]), NOW).rows;
    expect(row).toMatchObject({
      name: "Food",
      color: "#112233",
      amountText: "₹ 1,535 of ₹ 5,000",
      percent: 31,
      overBudget: false,
    });
  });

  it("shows only the spend without a cap, relative to the largest category", () => {
    const rows = buildCategoryBudgetsModel(snapshot([FUEL, { ...FOOD, budget: null }]), NOW).rows;
    expect(rows[0]).toMatchObject({ amountText: "₹ 3,000", percent: 100 });
    expect(rows[1]).toMatchObject({ amountText: "₹ 1,535", percent: 51 });
  });

  it("drops colours that are not plain hex and flags an exceeded cap", () => {
    const rows = buildCategoryBudgetsModel(snapshot([FUEL, FUN]), NOW).rows;
    expect(rows[0]!.color).toBeNull();
    expect(rows[1]).toMatchObject({ overBudget: true, percent: 100 });
  });

  it("keeps the top three only", () => {
    const rows = buildCategoryBudgetsModel(
      snapshot([FOOD, FUEL, FUN, { ...FOOD, id: "x", name: "Fourth" }]),
      NOW,
    ).rows;
    expect(rows.map((row) => row.name)).toEqual(["Food", "Fuel", "Fun"]);
  });

  it("explains an empty month and a snapshot from another month", () => {
    expect(buildCategoryBudgetsModel(snapshot([]), NOW).message).toBe("No spending yet this month");
    expect(
      buildCategoryBudgetsModel(snapshot([FOOD], { monthKey: "2026-09" }), NOW),
    ).toMatchObject({ rows: [], message: "Open Dime to refresh" });
  });

  it("hides every amount when asked", () => {
    const [row] = buildCategoryBudgetsModel(snapshot([FOOD]), NOW, true).rows;
    expect(row!.amountText).toBe("₹ •••• of ₹ ••••");
    expect(row!.percent).toBe(31);
  });
});
