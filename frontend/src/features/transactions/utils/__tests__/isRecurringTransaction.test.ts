import { isRecurringTransaction } from "../isRecurringTransaction";

describe("isRecurringTransaction", () => {
  it("is true for a row posted by a recurring item or filed under a recurring category", () => {
    expect(isRecurringTransaction({ recurring_item_id: "r1", category_scope: "spend" })).toBe(true);
    expect(isRecurringTransaction({ category_scope: "recurring_expense" })).toBe(true);
    expect(isRecurringTransaction({ category_scope: "recurring_income" })).toBe(true);
  });

  it("is false for everyday spend, uncategorized rows and rows from older API responses", () => {
    expect(isRecurringTransaction({ category_scope: "spend", recurring_item_id: null })).toBe(false);
    expect(isRecurringTransaction({ category_scope: null })).toBe(false);
    expect(isRecurringTransaction({})).toBe(false);
  });
});
