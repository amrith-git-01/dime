import { format } from "date-fns";

import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { bumpWidgetSnapshot } from "../widgetSnapshotBump";
import { readWidgetSnapshot, writeWidgetSnapshot } from "../widgetSnapshotMmkv";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));

const NOW = new Date(2026, 9, 15, 12, 0);
const SPEND = { userId: "user-a", id: "tx-1", name: "Chai", amount: 20, at: NOW.getTime() };

function seed(overrides: Record<string, unknown> = {}): void {
  writeWidgetSnapshot({
    userId: "user-a",
    updatedAt: NOW.getTime(),
    monthKey: format(NOW, "yyyy-MM"),
    dayKey: format(NOW, "yyyy-MM-dd"),
    spentThisMonth: 1000.5,
    recurringSpent: 200,
    flexibleSpent: 800.5,
    monthlyBudget: 5000,
    budgetLeft: 3999.5,
    spentToday: 100,
    recentTransactions: [],
    topCategories: [],
    recurring: [],
    ...overrides,
  });
}

describe("bumpWidgetSnapshot", () => {
  beforeEach(resetMockMmkv);

  it("adds the spend to the month, today, the flexible part and the budget left", () => {
    seed();
    expect(bumpWidgetSnapshot(SPEND, "add")).toBe(true);
    expect(readWidgetSnapshot()).toMatchObject({
      spentThisMonth: 1020.5,
      flexibleSpent: 820.5,
      recurringSpent: 200,
      spentToday: 120,
      budgetLeft: 3979.5,
    });
    expect(readWidgetSnapshot()?.recentTransactions).toEqual([
      { id: "tx-1", name: "Chai", amount: 20, type: "debit", at: NOW.toISOString() },
    ]);
  });

  it("undoes exactly what it added", () => {
    seed();
    bumpWidgetSnapshot(SPEND, "add");
    bumpWidgetSnapshot(SPEND, "remove");
    expect(readWidgetSnapshot()).toMatchObject({
      spentThisMonth: 1000.5,
      flexibleSpent: 800.5,
      spentToday: 100,
      budgetLeft: 3999.5,
      recentTransactions: [],
    });
  });

  it("judges the day by the tap, not by the clock: a tap on another day leaves today's total alone", () => {
    seed();
    const yesterday = new Date(2026, 9, 14, 23, 59).getTime();
    bumpWidgetSnapshot({ ...SPEND, at: yesterday }, "add");
    expect(readWidgetSnapshot()).toMatchObject({ spentToday: 100, spentThisMonth: 1020.5 });
    bumpWidgetSnapshot({ ...SPEND, at: yesterday }, "remove");
    expect(readWidgetSnapshot()).toMatchObject({ spentToday: 100, spentThisMonth: 1000.5 });
  });

  it("judges the month by the tap: a tap in another month leaves the month totals alone", () => {
    seed({ dayKey: "2026-09-30", monthKey: "2026-09" });
    const lastMonthTap = new Date(2026, 9, 1, 0, 5).getTime();
    expect(bumpWidgetSnapshot({ ...SPEND, at: lastMonthTap }, "add")).toBe(false);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000.5);
  });

  it("still bumps a snapshot taken last night for a tap made after midnight? no: month only", () => {
    // The snapshot is from yesterday (same month): the month moves, today's total (another day) does not.
    seed({ dayKey: "2026-10-14" });
    bumpWidgetSnapshot(SPEND, "add");
    expect(readWidgetSnapshot()).toMatchObject({ spentToday: 100, spentThisMonth: 1020.5 });
  });

  it("never touches another account's snapshot", () => {
    seed();
    expect(bumpWidgetSnapshot({ ...SPEND, userId: "user-b" }, "add")).toBe(false);
    expect(readWidgetSnapshot()?.spentThisMonth).toBe(1000.5);
  });

  it("keeps the budget left when there is no budget, and never goes below zero", () => {
    seed({ monthlyBudget: null, budgetLeft: null, spentToday: 5 });
    bumpWidgetSnapshot(SPEND, "remove");
    expect(readWidgetSnapshot()).toMatchObject({ budgetLeft: null, spentToday: 0 });
  });

  it("does nothing without a snapshot", () => {
    expect(bumpWidgetSnapshot(SPEND, "add")).toBe(false);
  });

  it("keeps at most five recent rows, newest first", () => {
    seed({
      recentTransactions: Array.from({ length: 5 }, (_, i) => ({
        id: `old-${i}`,
        name: "Old",
        amount: 1,
        type: "debit",
        at: NOW.toISOString(),
      })),
    });
    bumpWidgetSnapshot(SPEND, "add");
    const ids = readWidgetSnapshot()?.recentTransactions.map((tx) => tx.id);
    expect(ids).toEqual(["tx-1", "old-0", "old-1", "old-2", "old-3"]);
  });
});
