import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";

import { buildInsightsMonthSummary } from "../buildInsightsMonthSummary";

describe("buildInsightsMonthSummary", () => {
  it("shows zero hero and spent when there is no data", () => {
    const empty = buildInsightsMonthSummary(undefined, false, 0, false);
    expect(empty.heroDisplay).toBe(formatInrCompact(0));
    expect(empty.spentDisplay).toBe(formatInrCompact(0));
    expect(empty.hasIncome).toBe(false);
  });

  it("treats zero credit as no income and shows spend as hero", () => {
    const spendOnly = buildInsightsMonthSummary(
      {
        credit_total: "0",
        debit_total: "22822",
        net: "-22822",
        transaction_count: 4,
      },
      false,
      0,
      false,
    );
    expect(spendOnly.hasIncome).toBe(false);
    expect(spendOnly.heroDisplay).toBe(formatSpendMagnitude("22822"));
  });

  it("shows signed net as hero when there is income", () => {
    const withIncome = buildInsightsMonthSummary(
      {
        credit_total: "95000",
        debit_total: "22822",
        net: "72178",
        transaction_count: 10,
      },
      false,
      0,
      false,
    );
    expect(withIncome.hasIncome).toBe(true);
    expect(withIncome.heroDisplay).toBe(formatNetDisplay("72178"));
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
      false,
      0,
      false,
    );
    expect(summary.hasFixed).toBe(true);
    expect(summary.fixedDisplay).toBe(formatInrCompact(15000));
    expect(summary.flexibleDisplay).toBe(formatInrCompact(1000));
    expect(summary.expectedIncomeDisplay).toBeNull();
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
      false,
      0,
      false,
      { expectedIncome: 50000 },
    );
    expect(summary.expectedIncomeDisplay).toBe(formatInrCompact(50000));
  });

  it("leaves expected income out for a closed month, and has no fixed split without fixed spend", () => {
    const summary = buildInsightsMonthSummary(
      { credit_total: "2000", debit_total: "100", net: "1900", transaction_count: 2 },
      false,
      0,
      true,
      { expectedIncome: 50000 },
    );
    expect(summary.hasFixed).toBe(false);
    expect(summary.expectedIncomeDisplay).toBeNull();
  });
});
