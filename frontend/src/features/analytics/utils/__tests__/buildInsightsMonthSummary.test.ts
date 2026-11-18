import { resolveMonthBudget } from "@/features/budgets/utils/monthBudget";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

import { buildInsightsMonthSummary } from "../buildInsightsMonthSummary";

const NO_BUDGET = resolveMonthBudget(undefined);

/** A month picture as the server sends it: the cap and what counts toward it. */
function budget(over: { cap?: string | null; spent?: string; left?: string | null; committed?: string; fixed?: string } = {}) {
  return resolveMonthBudget(
    {
      monthly_budget: over.cap === undefined ? "30000.00" : over.cap,
      budget_spent: over.spent ?? "1000.00",
      budget_left: over.left === undefined ? "29000.00" : over.left,
      committed_total: over.committed ?? "0.00",
    },
    { fixedSpend: over.fixed ?? "0.00" },
  );
}

describe("buildInsightsMonthSummary", () => {
  it("shows zero spent when there is no data", () => {
    const empty = buildInsightsMonthSummary(undefined, NO_BUDGET, false);
    expect(empty.spentDisplay).toBe(formatInrCompact(0));
    expect(empty.hasIncome).toBe(false);
  });

  it("always headlines what was spent: net is the secondary number, even with income", () => {
    const withIncome = buildInsightsMonthSummary(
      {
        credit_total: "95000",
        debit_total: "22822",
        net: "72178",
        transaction_count: 10,
      },
      NO_BUDGET,
      false,
    );
    expect(withIncome.hasIncome).toBe(true);
    expect(withIncome.spentDisplay).toBe(formatSpendMagnitude("22822"));
    expect(withIncome.netDisplay).toBe(formatNetDisplay("72178"));
    expect("heroDisplay" in withIncome).toBe(false);

    const spendOnly = buildInsightsMonthSummary(
      { credit_total: "0", debit_total: "22822", net: "-22822", transaction_count: 4 },
      NO_BUDGET,
      false,
    );
    expect(spendOnly.hasIncome).toBe(false);
    expect(spendOnly.spentDisplay).toBe(formatSpendMagnitude("22822"));
  });

  it("splits fixed from flexible spend", () => {
    const summary = buildInsightsMonthSummary(
      {
        credit_total: "0",
        debit_total: "16000",
        net: "-16000",
        transaction_count: 4,
        fixed_debit_total: "15000",
        flexible_debit_total: "1000",
      },
      NO_BUDGET,
      false,
    );
    expect(summary.hasFixed).toBe(true);
    expect(summary.fixedDisplay).toBe(formatInrCompact(15000));
    expect(summary.flexibleDisplay).toBe(formatInrCompact(1000));
    expect(summary.expectedIncomeDisplay).toBeNull();
    expect(summary.budgetValue).toBe(0);
  });

  it("carries the month's cap and the server's signed left for the split bar", () => {
    const summary = buildInsightsMonthSummary(
      { credit_total: "0", debit_total: "1000", net: "-1000", transaction_count: 1 },
      budget(),
      false,
    );
    expect(summary.budgetValue).toBe(30000);
    expect(summary.budgetLeft).toBe(29000);
    expect(summary.remainingDisplay).toBe(formatInrCompact(29000));
    expect(buildInsightsMonthSummary(undefined, budget(), false).budgetValue).toBe(30000);
  });

  it("shows how far over budget, not a left of zero", () => {
    const summary = buildInsightsMonthSummary(
      { credit_total: "0", debit_total: "32500", net: "-32500", transaction_count: 9 },
      budget({ spent: "32500.00", left: "-2500.00" }),
      false,
    );
    expect(summary.isOverBudget).toBe(true);
    expect(summary.remainingLabel).toBe("Over budget");
    expect(summary.remainingDisplay).toBe(formatInrCompact(2500));
    expect(summary.remainingValue).toBe(0);
    expect(summary.budgetLeft).toBe(-2500);
    expect(summary.usedPctDisplay).toBe("108%");
  });

  it("with a budget the split bar is the budget: recurring that counts toward it plus everyday spend", () => {
    const summary = buildInsightsMonthSummary(
      {
        credit_total: "0",
        debit_total: "18000",
        net: "-18000",
        transaction_count: 6,
        fixed_debit_total: "15000",
      },
      // 15000 fixed in all, 12000 of it committed (rent): 3000 recurring counts toward the budget, 1000 is everyday.
      budget({ spent: "4000.00", left: "26000.00", committed: "12000.00", fixed: "15000.00" }),
      false,
    );
    expect(summary.fixedValue).toBe(3000);
    expect(summary.flexibleValue).toBe(1000);
    expect(summary.hasFixed).toBe(true);
  });

  it("shows the fixed income still to come", () => {
    const summary = buildInsightsMonthSummary(
      {
        credit_total: "2000",
        debit_total: "16000",
        net: "-14000",
        transaction_count: 5,
        fixed_debit_total: "15000",
      },
      NO_BUDGET,
      false,
      { expectedIncome: 50000 },
    );
    expect(summary.expectedIncomeDisplay).toBe(formatInrCompact(50000));
  });

  it("leaves expected income out for a closed month, and has no fixed split without fixed spend", () => {
    const summary = buildInsightsMonthSummary(
      { credit_total: "2000", debit_total: "100", net: "1900", transaction_count: 2 },
      NO_BUDGET,
      true,
      { expectedIncome: 50000 },
    );
    expect(summary.hasFixed).toBe(false);
    expect(summary.expectedIncomeDisplay).toBeNull();
  });
});
