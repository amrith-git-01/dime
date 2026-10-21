import type { InfiniteData } from "@tanstack/react-query";

import type { TransactionListPage } from "@/features/transactions/types";

import { buildSampleMonth } from "../buildSampleMonth";
import {
  isBudgetEmpty,
  isCategoryBudgetsEmpty,
  isDebitTotalsEmpty,
  isHomeOverviewEmpty,
  isInsightsDataEmpty,
  isMonthPagesEmpty,
  isMonthSummaryEmpty,
  isRecurringListEmpty,
  isRecurringMonthEmpty,
} from "../realDataEmpty";

const sample = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: "Asia/Kolkata" });

function pages(...itemCounts: number[]): InfiniteData<TransactionListPage, number> {
  return {
    pageParams: itemCounts.map((_, index) => index),
    pages: itemCounts.map((count) => ({
      items: sample.monthPages.pages[0].items.slice(0, count),
      has_more: false,
    })),
  };
}

describe("what counts as an empty screen", () => {
  it("Home: no recent transactions and nothing spent this month", () => {
    expect(
      isHomeOverviewEmpty({
        ...sample.homeOverview,
        recent_transactions: [],
        spent_this_month: "0",
      }),
    ).toBe(true);
    expect(isHomeOverviewEmpty(sample.homeOverview)).toBe(false);
    expect(
      isHomeOverviewEmpty({ ...sample.homeOverview, recent_transactions: [], spent_this_month: "40.00" }),
    ).toBe(false);
  });

  it("month summary, insights and spend by category: no transactions", () => {
    expect(isMonthSummaryEmpty({ ...sample.monthSummary, transaction_count: 0 })).toBe(true);
    expect(isMonthSummaryEmpty(sample.monthSummary)).toBe(false);
    expect(isInsightsDataEmpty({ ...sample.insights, summary: { ...sample.insights.summary, transaction_count: 0 } })).toBe(true);
    expect(isInsightsDataEmpty(sample.insights)).toBe(false);
    expect(isDebitTotalsEmpty({})).toBe(true);
    expect(isDebitTotalsEmpty(sample.debitTotalsByCategory)).toBe(false);
  });

  it("a month list: no rows on any page", () => {
    expect(isMonthPagesEmpty(pages())).toBe(true);
    expect(isMonthPagesEmpty(pages(0, 0))).toBe(true);
    expect(isMonthPagesEmpty(pages(0, 2))).toBe(false);
  });

  it("recurring: no items, in the list or in the month", () => {
    expect(isRecurringListEmpty({ ...sample.recurringIncome, items: [] })).toBe(true);
    expect(isRecurringListEmpty(sample.recurringIncome)).toBe(false);
    expect(isRecurringMonthEmpty({ ...sample.recurringMonth, items: [] })).toBe(true);
    expect(isRecurringMonthEmpty(sample.recurringMonth)).toBe(false);
  });

  it("budgets: no monthly budget, and no category budgets", () => {
    expect(isBudgetEmpty({ budget: null })).toBe(true);
    expect(isBudgetEmpty(sample.budget)).toBe(false);
    expect(isCategoryBudgetsEmpty([])).toBe(true);
    expect(isCategoryBudgetsEmpty(sample.categoryBudgets)).toBe(false);
  });
});
