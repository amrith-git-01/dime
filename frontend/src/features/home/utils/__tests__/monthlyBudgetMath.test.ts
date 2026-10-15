import { computeMonthlyBudgetMath } from "../monthlyBudgetMath";

describe("computeMonthlyBudgetMath", () => {
  it("computes left and progress against a budget", () => {
    const math = computeMonthlyBudgetMath("30000.00", "-6177.00");
    expect(math.hasMonthlyBudget).toBe(true);
    expect(math.hasSpentMonth).toBe(true);
    expect(math.spentMonthNum).toBe(6177);
    expect(math.monthlyLeft).toBe(23823);
    expect(math.monthlyProgress).toBeCloseTo(0.2059, 3);
  });

  it("clamps left to 0 and progress to 1 when over budget", () => {
    const math = computeMonthlyBudgetMath("1000", "1500");
    expect(math.monthlyLeft).toBe(0);
    expect(math.monthlyProgress).toBe(1);
  });

  it("has no left or progress without a budget", () => {
    const math = computeMonthlyBudgetMath(undefined, "500");
    expect(math.hasMonthlyBudget).toBe(false);
    expect(Number.isNaN(math.monthlyLeft)).toBe(true);
    expect(math.monthlyProgress).toBe(0);
  });

  it("treats a zero budget as no budget", () => {
    expect(computeMonthlyBudgetMath("0.00", "500").hasMonthlyBudget).toBe(false);
  });

  it("has no spend before the overview is loaded", () => {
    const math = computeMonthlyBudgetMath("1000", undefined);
    expect(math.hasSpentMonth).toBe(false);
    expect(math.monthlyProgress).toBe(0);
  });
});
