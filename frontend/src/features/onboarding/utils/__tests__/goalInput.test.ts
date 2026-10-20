import {
  budgetAmountForGoal,
  parseBudgetInput,
  resolveGoalSubmission,
  sanitizeBudgetInput,
} from "../goalInput";

describe("budget input", () => {
  it("keeps digits only and caps the length", () => {
    expect(sanitizeBudgetInput("₹ 30,000.50")).toBe("3000050");
    expect(sanitizeBudgetInput("123456789012")).toBe("12345678");
  });

  it("parses a positive amount, and nothing for empty or zero", () => {
    expect(parseBudgetInput("30000")).toBe(30000);
    expect(parseBudgetInput("")).toBeNull();
    expect(parseBudgetInput("abc")).toBeNull();
    expect(parseBudgetInput("000")).toBeNull();
  });

  it("counts the amount only for the budget goal", () => {
    expect(budgetAmountForGoal("budget", "25000")).toBe(25000);
    expect(budgetAmountForGoal("track", "25000")).toBeNull();
    expect(budgetAmountForGoal(null, "25000")).toBeNull();
  });
});

describe("resolveGoalSubmission", () => {
  it("stores the goal and the budget to save for the budget goal", () => {
    expect(resolveGoalSubmission("budget", "30000", false)).toEqual({
      stored: { goal: "budget", budgetAmount: 30000 },
      budgetAmount: 30000,
    });
  });

  it("stores the goal alone when no amount was typed", () => {
    expect(resolveGoalSubmission("budget", "", false)).toEqual({
      stored: { goal: "budget" },
      budgetAmount: null,
    });
    expect(resolveGoalSubmission("save", "30000", false)).toEqual({
      stored: { goal: "save" },
      budgetAmount: null,
    });
  });

  it("stores nothing when skipped or when no goal was chosen", () => {
    expect(resolveGoalSubmission("budget", "30000", true)).toEqual({ stored: null, budgetAmount: null });
    expect(resolveGoalSubmission(null, "30000", false)).toEqual({ stored: null, budgetAmount: null });
  });
});
