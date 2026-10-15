import type {
  WidgetSnapshot,
  WidgetSnapshotRecurring,
} from "@/lib/widgets/widgetSnapshotMmkv";

import { buildUpcomingModel } from "../upcomingModel";

const NOW = new Date(2026, 9, 31, 12, 0);

function item(
  id: string,
  nextDueDate: string,
  overrides: Partial<WidgetSnapshotRecurring> = {},
): WidgetSnapshotRecurring {
  return { id, kind: "subscription", name: id, amount: 500, nextDueDate, ...overrides };
}

function snapshot(recurring: WidgetSnapshotRecurring[]): WidgetSnapshot {
  return {
    version: 2,
    userId: "user-a",
    updatedAt: NOW.getTime(),
    monthKey: "2026-10",
    dayKey: "2026-10-31",
    spentThisMonth: 0,
    recurringSpent: 0,
    flexibleSpent: 0,
    monthlyBudget: null,
    budgetLeft: null,
    spentToday: 0,
    recentTransactions: [],
    topCategories: [],
    recurring,
  };
}

describe("buildUpcomingModel", () => {
  it("prompts to sign in without a snapshot", () => {
    const model = buildUpcomingModel(null, NOW);
    expect(model.signedOut).toBe(true);
    expect(model.message).toBe("Sign in to Dime");
  });

  it("lists the next three due items, soonest first, with friendly due dates", () => {
    const model = buildUpcomingModel(
      snapshot([
        item("Rent", "2026-11-01", { amount: 15000 }),
        item("Salary", "2026-10-31", { kind: "income", amount: 50000 }),
        item("Netflix", "2026-11-01", { amount: 649 }),
        item("Gym", "2026-11-20", { amount: 1200 }),
        item("Far away", "2026-12-25"),
      ]),
      NOW,
    );
    expect(model.rows.map((row) => [row.name, row.due])).toEqual([
      ["Salary", "Today"],
      ["Rent", "Tomorrow"],
      ["Netflix", "Tomorrow"],
    ]);
    expect(model.rows[0]).toMatchObject({ income: true, amount: "+₹ 50,000" });
    expect(model.rows[1]).toMatchObject({ income: false, amount: "₹ 15,000" });
    expect(model.message).toBeNull();
  });

  it("writes later dates as day and month", () => {
    const model = buildUpcomingModel(snapshot([item("Gym", "2026-11-20")]), NOW);
    expect(model.rows[0]!.due).toBe("20 Nov");
  });

  it("explains when nothing is due in the next 30 days", () => {
    const model = buildUpcomingModel(snapshot([item("Far away", "2026-12-25")]), NOW);
    expect(model.rows).toEqual([]);
    expect(model.message).toBe("No recurring due in the next 30 days");
  });

  it("drops items already past due and judges dates against the draw time", () => {
    const model = buildUpcomingModel(snapshot([item("Old", "2026-10-30")]), NOW);
    expect(model.rows).toEqual([]);
  });

  it("hides every amount when asked", () => {
    const model = buildUpcomingModel(
      snapshot([item("Rent", "2026-11-01", { amount: 15000 })]),
      NOW,
      true,
    );
    expect(model.rows[0]!.amount).toBe("₹ ••••");
    expect(model.accessibilityLabel).not.toContain("15,000");
  });
});
