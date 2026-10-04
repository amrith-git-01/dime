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
});
