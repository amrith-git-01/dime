import { emptyStateCopy } from "@/components/shared/emptyStateCopy";

import { resolveListEmptyCopy } from "../listEmptyCopy";

describe("resolveListEmptyCopy", () => {
  it("talks about debits for a payee list", () => {
    expect(resolveListEmptyCopy("payee", false, "debit")).toBe(
      emptyStateCopy.transactionsListPayee,
    );
    expect(resolveListEmptyCopy("payee", true, "debit")).toBe(
      emptyStateCopy.transactionsListPayeeRange,
    );
  });

  it("talks about credits for a payer list", () => {
    expect(resolveListEmptyCopy("payee", false, "credit")).toBe(
      emptyStateCopy.transactionsListPayer,
    );
    expect(resolveListEmptyCopy("payee", true, "credit").subtext).toContain(
      "credits",
    );
  });

  it("has copy for each month list kind", () => {
    expect(resolveListEmptyCopy("month", false, "debit")).toBe(
      emptyStateCopy.transactionsListMonth,
    );
    expect(resolveListEmptyCopy("month", false, "debit", "all")).toBe(
      emptyStateCopy.transactionsListMonth,
    );
    expect(resolveListEmptyCopy("month", false, "debit", "recurring")).toBe(
      emptyStateCopy.transactionsListMonthRecurring,
    );
    expect(resolveListEmptyCopy("month", false, "debit", "flexible")).toBe(
      emptyStateCopy.transactionsListMonthFlexible,
    );
    expect(resolveListEmptyCopy("month", false, "debit", "income")).toBe(
      emptyStateCopy.transactionsListMonthIncome,
    );
  });

  it("has generic copy once other filters narrow the month list", () => {
    expect(resolveListEmptyCopy("month", false, "debit", "filtered")).toBe(
      emptyStateCopy.transactionsListMonthFiltered,
    );
  });

  it("ignores the direction for day and category lists", () => {
    expect(resolveListEmptyCopy("day", false, "credit")).toBe(
      emptyStateCopy.transactionsListDay,
    );
    expect(resolveListEmptyCopy("category", true, "credit")).toBe(
      emptyStateCopy.transactionsListCategoryRange,
    );
  });

  it("names the recurring item for its history", () => {
    expect(resolveListEmptyCopy("recurring", false, "debit", "all", "Netflix").headline).toBe(
      "No payments recorded for Netflix yet",
    );
    expect(resolveListEmptyCopy("recurring", false, "debit").headline).toBe(
      "No payments recorded yet",
    );
  });
});
