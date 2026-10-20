import {
  CATEGORY_SPEND,
  MONTH_BUDGET,
  MONTH_RECURRING,
  MONTH_TOTAL,
  MONTH_TOTAL_BEFORE_QUICK_ADD,
  REEL_PAYEES,
} from "../reelStory";

describe("the reel's October", () => {
  it("counts the month total up to 18,620 with the Chai entry", () => {
    expect(MONTH_TOTAL_BEFORE_QUICK_ADD).toBe(18500);
    expect(MONTH_TOTAL).toBe(18620);
  });

  it("splits the month total exactly across the donut categories", () => {
    const sum = Object.values(CATEGORY_SPEND).reduce((a, b) => a + b, 0);
    expect(sum).toBe(MONTH_TOTAL);
    const shares = Object.values(CATEGORY_SPEND).map((amount) =>
      Math.round((amount / MONTH_TOTAL) * 100),
    );
    expect(shares).toEqual([38, 27, 19, 16]);
  });

  it("leaves the budget card consistent with the total", () => {
    expect(Math.round((MONTH_TOTAL / MONTH_BUDGET) * 100)).toBe(62);
    expect(MONTH_BUDGET - MONTH_TOTAL).toBe(11380);
    expect(MONTH_TOTAL - MONTH_RECURRING).toBe(16220);
  });

  it("keeps the food payees within the food total", () => {
    const food = Object.values(REEL_PAYEES)
      .filter((payee) => payee.category === "food")
      .reduce((sum, payee) => sum + payee.amount, 0);
    expect(food).toBeLessThanOrEqual(CATEGORY_SPEND.food);
  });
});
