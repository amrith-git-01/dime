import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";

import {
  buildThisMonthModel,
  thisMonthLayout,
  thisMonthShowsSplit,
} from "../thisMonthModel";

const NOW = new Date(2026, 9, 15, 12, 0);

function snapshot(overrides: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    version: 2,
    userId: "user-a",
    updatedAt: NOW.getTime(),
    monthKey: "2026-10",
    dayKey: "2026-10-15",
    spentThisMonth: 6177,
    recurringSpent: 2000,
    flexibleSpent: 4177,
    monthlyBudget: 30000,
    budgetLeft: 23823,
    spentToday: 0,
    recentTransactions: [],
    topCategories: [],
    ...overrides,
  };
}

describe("buildThisMonthModel", () => {
  it("prompts to sign in without a snapshot", () => {
    const model = buildThisMonthModel(null, NOW);
    expect(model.signedOut).toBe(true);
    expect(model.amount).toBe("Sign in to Dime");
    expect(model.progressPercent).toBeNull();
  });

  it("shows spend, budget line, progress and the recurring split", () => {
    const model = buildThisMonthModel(snapshot(), NOW);
    expect(model.signedOut).toBe(false);
    expect(model.title).toBe("This month");
    expect(model.amount).toBe("₹ 6,177");
    expect(model.budgetLine).toBe("₹ 23,823 left of ₹ 30,000");
    expect(model.progressPercent).toBe(21);
    expect(model.overBudget).toBe(false);
    expect(model.splitLine).toBe(
      "Recurring ₹ 2,000 · Flexible ₹ 4,177",
    );
    expect(model.accessibilityLabel).toContain("Spent");
    expect(model.accessibilityLabel).toContain("left of");
  });

  it("shows only the spend without a budget or recurring spend", () => {
    const model = buildThisMonthModel(
      snapshot({ monthlyBudget: null, budgetLeft: null, recurringSpent: 0 }),
      NOW,
    );
    expect(model.amount).toBe("₹ 6,177");
    expect(model.budgetLine).toBeNull();
    expect(model.progressPercent).toBeNull();
    expect(model.splitLine).toBeNull();
  });

  it("flags and caps an exceeded budget", () => {
    const model = buildThisMonthModel(
      snapshot({ spentThisMonth: 35000, budgetLeft: 0 }),
      NOW,
    );
    expect(model.overBudget).toBe(true);
    expect(model.progressPercent).toBe(100);
    expect(model.budgetLine).toBe("₹ 0 left of ₹ 30,000");
  });

  it("keeps a sliver of progress for a tiny spend", () => {
    const model = buildThisMonthModel(
      snapshot({ spentThisMonth: 10, budgetLeft: 29990 }),
      NOW,
    );
    expect(model.progressPercent).toBe(1);
  });

  it("does not present last month's totals as this month's", () => {
    const model = buildThisMonthModel(snapshot({ monthKey: "2026-09" }), NOW);
    expect(model.amount).toBe("₹—");
    expect(model.budgetLine).toBeNull();
    expect(model.hint).toBe("Open Dime to refresh");
  });
});

describe("layout", () => {
  it("is compact only for short (4x1) widgets", () => {
    expect(thisMonthLayout(70)).toBe("compact");
    expect(thisMonthLayout(110)).toBe("full");
    expect(thisMonthLayout(0)).toBe("full");
  });

  it("shows the split line only when tall enough or when the height is unknown", () => {
    expect(thisMonthShowsSplit(110)).toBe(false);
    expect(thisMonthShowsSplit(160)).toBe(true);
    expect(thisMonthShowsSplit(0)).toBe(true);
  });
});
