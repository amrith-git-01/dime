import type { WidgetSnapshot } from "@/lib/widgets/widgetSnapshotMmkv";

import { buildTodayModel } from "../todayModel";

const NOW = new Date(2026, 9, 15, 12, 0);
const TODAY_9AM = new Date(2026, 9, 15, 9, 0).toISOString();
const TODAY_8AM = new Date(2026, 9, 15, 8, 0).toISOString();
const YESTERDAY = new Date(2026, 9, 14, 21, 0).toISOString();

function snapshot(overrides: Partial<WidgetSnapshot> = {}): WidgetSnapshot {
  return {
    version: 2,
    userId: "user-a",
    updatedAt: NOW.getTime(),
    monthKey: "2026-10",
    dayKey: "2026-10-15",
    spentThisMonth: 6177,
    recurringSpent: 0,
    flexibleSpent: 6177,
    monthlyBudget: null,
    budgetLeft: null,
    spentToday: 270,
    recentTransactions: [
      { id: "t1", name: "Chai", amount: 20, type: "debit", at: TODAY_9AM },
      { id: "t2", name: "Swiggy", amount: 250, type: "debit", at: TODAY_8AM },
      { id: "t3", name: "Salary", amount: 1000, type: "credit", at: TODAY_8AM },
      { id: "t4", name: "Dinner", amount: 400, type: "debit", at: YESTERDAY },
    ],
    topCategories: [],
    recurring: [],
    ...overrides,
  };
}

describe("buildTodayModel", () => {
  it("prompts to sign in without a snapshot", () => {
    const model = buildTodayModel(null, NOW);
    expect(model.signedOut).toBe(true);
    expect(model.amount).toBe("Sign in to Dime");
    expect(model.rows).toEqual([]);
  });

  it("shows today's total and the first two of today's transactions", () => {
    const model = buildTodayModel(snapshot(), NOW);
    expect(model.title).toBe("Today");
    expect(model.amount).toBe("₹ 270");
    expect(model.rows.map((row) => row.name)).toEqual(["Chai", "Swiggy"]);
    expect(model.rows[0]!.amount).toBe("₹ 20");
    expect(model.hint).toBeNull();
  });

  it("skips other days and marks money in with a plus", () => {
    const model = buildTodayModel(
      snapshot({
        recentTransactions: [
          { id: "t4", name: "Dinner", amount: 400, type: "debit", at: YESTERDAY },
          { id: "t3", name: "Salary", amount: 1000, type: "credit", at: TODAY_8AM },
        ],
      }),
      NOW,
    );
    expect(model.rows).toEqual([
      { id: "t3", name: "Salary", amount: "+₹ 1,000", credit: true },
    ]);
  });

  it("does not present yesterday's total as today's", () => {
    const model = buildTodayModel(snapshot({ dayKey: "2026-10-14" }), NOW);
    expect(model.amount).toBe("₹—");
    expect(model.hint).toBe("Open Dime");
  });

  it("says so when nothing was spent yet", () => {
    const model = buildTodayModel(
      snapshot({ spentToday: 0, recentTransactions: [] }),
      NOW,
    );
    expect(model.rows).toEqual([]);
    expect(model.hint).toBe("Nothing spent yet");
  });

  it("hides every amount when asked", () => {
    const model = buildTodayModel(snapshot(), NOW, true);
    expect(model.amount).toBe("₹ ••••");
    expect(model.rows.every((row) => row.amount === "₹ ••••")).toBe(true);
    expect(model.accessibilityLabel).not.toContain("270");
  });
});
