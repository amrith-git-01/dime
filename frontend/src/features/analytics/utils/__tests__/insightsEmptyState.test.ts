import type { InsightsSummary } from "../../types";
import { isInsightsMonthEmpty } from "../insightsEmptyState";

const summary = (transaction_count: number): { summary: InsightsSummary } => ({
  summary: {
    credit_total: "0.00",
    debit_total: "0.00",
    net: "0.00",
    transaction_count,
  },
});

describe("isInsightsMonthEmpty", () => {
  it("is empty only for a loaded month without transactions", () => {
    expect(isInsightsMonthEmpty(summary(0))).toBe(true);
    expect(isInsightsMonthEmpty(summary(1))).toBe(false);
  });

  it("is not empty while nothing has loaded", () => {
    expect(isInsightsMonthEmpty(undefined)).toBe(false);
  });
});
