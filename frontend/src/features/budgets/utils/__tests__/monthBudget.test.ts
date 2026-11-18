import { pendingRowFromItem, type PendingTransactionRow } from "@/features/outbox/utils/pendingMerge";
import type { MonthBudgetPicture } from "@/features/transactions/types";
import { manualItem } from "@/lib/outbox/__tests__/fixtures";

import { resolveMonthBudget } from "../monthBudget";

/** A month as the server sends it: the one ledger definition, signed `budget_left`. */
const PICTURE: MonthBudgetPicture = {
  monthly_budget: "30000.00",
  budget_spent: "12000.50",
  budget_left: "17999.50",
  committed_total: "15000.00",
};

function pending(over: { type?: "debit" | "credit"; kind?: "spend" | "income" | "transfer"; amount?: string }): PendingTransactionRow {
  const base = manualItem();
  const row = pendingRowFromItem(
    {
      ...base,
      preview: {
        ...base.preview!,
        amount: over.amount ?? "250.00",
        type: over.type ?? "debit",
        ...(over.kind ? { kind: over.kind } : {}),
      },
    },
    "u1",
  );
  return row!;
}

describe("resolveMonthBudget", () => {
  it("reads the server's cap, spend, signed left and committed money as they are", () => {
    const month = resolveMonthBudget(PICTURE);
    expect(month).toMatchObject({
      hasBudget: true,
      budget: 30000,
      spent: 12000.5,
      left: 17999.5,
      overBy: 0,
      isOver: false,
      committed: 15000,
    });
    expect(month.usedFraction).toBeCloseTo(0.4, 2);
    expect(month.usedPercent).toBe(40);
  });

  it("over budget is a signed negative left and an overBy, never clamped to zero", () => {
    const month = resolveMonthBudget({ ...PICTURE, budget_spent: "32500.00", budget_left: "-2500.00" });
    expect(month.left).toBe(-2500);
    expect(month.isOver).toBe(true);
    expect(month.overBy).toBe(2500);
    // The bar fill stops at full; the percent keeps counting.
    expect(month.usedFraction).toBe(1);
    expect(month.usedPercent).toBe(108);
  });

  it("has no budget (and no left) when the month has no cap", () => {
    const month = resolveMonthBudget({ monthly_budget: null, budget_spent: "900.00", budget_left: null, committed_total: "0.00" });
    expect(month.hasBudget).toBe(false);
    expect(month.left).toBeNull();
    expect(month.spent).toBe(900);
    expect(month.usedFraction).toBe(0);
    expect(resolveMonthBudget(undefined)).toMatchObject({ hasBudget: false, left: null, spent: 0 });
  });

  it("a past month uses the cap it had then: its own picture, never today's budget", () => {
    const august = resolveMonthBudget({ ...PICTURE, monthly_budget: "20000.00", budget_spent: "21000.00", budget_left: "-1000.00" });
    expect(august).toMatchObject({ budget: 20000, left: -1000, isOver: true });
    expect(resolveMonthBudget(PICTURE).budget).toBe(30000);
  });

  describe("outbox overlay", () => {
    it("takes waiting spend off the left and adds it to the spent, in exact paise", () => {
      const month = resolveMonthBudget(PICTURE, { pending: [pending({ amount: "250.25" }), pending({ amount: "0.10" })] });
      expect(month.spent).toBe(12000.5 + 250.35);
      expect(month.left).toBe(17999.5 - 250.35);
    });

    it("can push the month over budget before the server knows", () => {
      const month = resolveMonthBudget(
        { ...PICTURE, budget_spent: "29900.00", budget_left: "100.00" },
        { pending: [pending({ amount: "250.00" })] },
      );
      expect(month.left).toBe(-150);
      expect(month.isOver).toBe(true);
      expect(month.overBy).toBe(150);
    });

    it("leaves out what the server would leave out: income and transfers", () => {
      const month = resolveMonthBudget(PICTURE, {
        pending: [
          pending({ type: "credit", amount: "5000.00" }),
          pending({ kind: "transfer", amount: "3000.00" }),
          pending({ type: "credit", kind: "transfer", amount: "100.00" }),
        ],
      });
      expect(month.spent).toBe(12000.5);
      expect(month.left).toBe(17999.5);
    });

    it("changes nothing without a budget but still counts the waiting spend", () => {
      const month = resolveMonthBudget({ ...PICTURE, monthly_budget: null, budget_left: null }, { pending: [pending({})] });
      expect(month.left).toBeNull();
      expect(month.spent).toBe(12250.5);
    });
  });

  describe("recurring split for the bar", () => {
    it("recurring that counts toward the budget is the fixed spend minus what is committed", () => {
      // 15000 fixed in all, 12000 of it committed (rent): 3000 counts toward the budget.
      const month = resolveMonthBudget(
        { ...PICTURE, budget_spent: "4000.00", budget_left: "26000.00", committed_total: "12000.00" },
        { fixedSpend: "15000.00" },
      );
      expect(month.recurringInBudget).toBe(3000);
      expect(month.flexibleInBudget).toBe(1000);
    });

    it("by default (everything recurring is committed) the budget is all everyday spend", () => {
      const month = resolveMonthBudget(
        { ...PICTURE, budget_spent: "4000.00", budget_left: "26000.00", committed_total: "15000.00" },
        { fixedSpend: "15000.00" },
      );
      expect(month.recurringInBudget).toBe(0);
      expect(month.flexibleInBudget).toBe(4000);
    });

    it("waiting spend is everyday spend", () => {
      const month = resolveMonthBudget(
        { ...PICTURE, budget_spent: "4000.00", budget_left: "26000.00", committed_total: "12000.00" },
        { fixedSpend: "15000.00", pending: [pending({ amount: "500.00" })] },
      );
      expect(month.recurringInBudget).toBe(3000);
      expect(month.flexibleInBudget).toBe(1500);
    });
  });
});
