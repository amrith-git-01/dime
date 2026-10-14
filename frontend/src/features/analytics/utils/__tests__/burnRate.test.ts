import type { RecurringOccurrence } from "@/features/recurring/types";

import type { DailyCashflowRow } from "../../types";
import { buildBurnRateSeries } from "../buildBurnRateSeries";
import { computeBurnRateMetrics } from "../computeBurnRateMetrics";
import { fixedPlanFromOccurrences } from "../fixedPlan";

/** A 30-day month (Nov 2026) with `perDay` debit on each day up to `daysWithSpend`, plus extra amounts by day. */
function november(
  daysWithSpend: number,
  perDay: number,
  extra: Record<number, number> = {},
): DailyCashflowRow[] {
  return Array.from({ length: 30 }, (_, i) => {
    const day = i + 1;
    const debit = (day <= daysWithSpend ? perDay : 0) + (extra[day] ?? 0);
    return {
      date: `2026-11-${String(day).padStart(2, "0")}`,
      debit_total: String(debit),
      credit_total: "0",
    };
  });
}

const NOV = 10; // monthIndex0
const at = (day: number) => new Date(2026, NOV, day);

describe("buildBurnRateSeries", () => {
  it("is the straight line budget * d / days without fixed items", () => {
    const points = buildBurnRateSeries(november(0, 0), 30000);
    expect(points[0].pace).toBe(1000);
    expect(points[14].pace).toBe(15000);
    expect(points[29].pace).toBe(30000);
  });

  it("steps up by fixed amounts on their due day, with the rest spread evenly", () => {
    // Budget 30,000, rent 15,000 due on the 5th: flexible allowance 15,000 -> 500 per day.
    const points = buildBurnRateSeries(november(0, 0), 30000, [
      { day: 5, amount: 15000, paid: false },
    ]);
    expect(points[3].pace).toBe(2000); // day 4: 4 * 500
    expect(points[4].pace).toBe(17500); // day 5: 15,000 + 2,500
    expect(points[29].pace).toBe(30000); // ends at the budget
  });

  it("never goes negative on the flexible side when fixed costs exceed the budget", () => {
    const points = buildBurnRateSeries(november(0, 0), 10000, [
      { day: 1, amount: 12000, paid: false },
    ]);
    expect(points[0].pace).toBe(12000);
    expect(points[29].pace).toBe(12000);
  });

  it("has no pace without a budget", () => {
    expect(
      buildBurnRateSeries(november(3, 100), null, [
        { day: 1, amount: 5, paid: true },
      ])[0].pace,
    ).toBeNull();
  });

  it("accumulates spend exactly in paise", () => {
    const points = buildBurnRateSeries(november(3, 0.1), null);
    expect(points[2].spent).toBeCloseTo(0.3, 10);
  });
});

describe("computeBurnRateMetrics", () => {
  const rent = { day: 1, amount: 15000, paid: true };

  it("behaves like the plain pace when there is no fixed data", () => {
    const m = computeBurnRateMetrics(november(10, 1000), 30000, 2026, NOV, {
      today: at(10),
    });
    expect(m?.idealPace).toBe(10000);
    expect(m?.spentSoFar).toBe(10000);
    expect(m?.projected).toBe(30000);
    expect(m?.isOverPace).toBe(false);
    expect(m?.fixedPlan).toBe(0);
  });

  it("compares spent to the stepped ideal and projects fixed plan + flexible run rate", () => {
    // Rent 15,000 paid on day 1 plus 500 flexible a day for 10 days; budget 30,000.
    const m = computeBurnRateMetrics(
      november(10, 500, { 1: 15000 }),
      30000,
      2026,
      NOV,
      { today: at(10), fixedItems: [rent], fixedSpentSoFar: 15000 },
    );
    expect(m?.spentSoFar).toBe(20000);
    expect(m?.idealPace).toBe(20000); // 15,000 + 15,000 * 10 / 30
    expect(m?.isOverPace).toBe(false); // equal is on pace
    expect(m?.flexibleSpent).toBe(5000);
    expect(m?.projected).toBe(30000); // 15,000 + 5,000 / 10 * 30
    expect(m?.flexibleAllowance).toBe(15000);
  });

  it("flags over pace when flexible spend runs ahead", () => {
    const m = computeBurnRateMetrics(
      november(10, 900, { 1: 15000 }),
      30000,
      2026,
      NOV,
      { today: at(10), fixedItems: [rent], fixedSpentSoFar: 15000 },
    );
    expect(m?.isOverPace).toBe(true);
    expect(m?.projected).toBe(15000 + 27000);
  });

  it("counts upcoming fixed costs in the projection and the plan before they are paid", () => {
    const m = computeBurnRateMetrics(november(10, 500), 30000, 2026, NOV, {
      today: at(10),
      fixedItems: [{ day: 20, amount: 9000, paid: false }],
      fixedSpentSoFar: 0,
    });
    expect(m?.fixedPlan).toBe(9000);
    expect(m?.projected).toBe(9000 + 15000); // 5,000 / 10 * 30 = 15,000 flexible
    expect(m?.idealPace).toBe(7000); // not due yet: 21,000 * 10 / 30
  });

  it("treats fixed spend entered by hand (not in the plan) as planned and paid", () => {
    const m = computeBurnRateMetrics(
      november(10, 0, { 2: 4000 }),
      30000,
      2026,
      NOV,
      { today: at(10), fixedItems: [], fixedSpentSoFar: 4000 },
    );
    expect(m?.flexibleSpent).toBe(0);
    expect(m?.fixedPlan).toBe(4000);
    expect(m?.projected).toBe(4000);
  });

  it("reports the final total for a past month", () => {
    const m = computeBurnRateMetrics(
      november(30, 500, { 1: 15000 }),
      30000,
      2026,
      NOV,
      {
        today: new Date(2026, NOV + 1, 5),
        fixedItems: [rent],
        fixedSpentSoFar: 15000,
      },
    );
    expect(m?.projected).toBe(m?.spentSoFar);
    expect(m?.projectedLabel).toBe("Final total");
  });

  it("without a budget there is no ideal pace and no allowance", () => {
    const m = computeBurnRateMetrics(november(10, 500), null, 2026, NOV, {
      today: at(10),
    });
    expect(m?.idealPace).toBeNull();
    expect(m?.isOverPace).toBe(false);
    expect(m?.flexibleAllowance).toBeNull();
    expect(m?.hasMonthlyBudget).toBe(false);
  });

  it("with fixed costs above the budget the allowance is 0 and the plan alone sets the ideal", () => {
    const m = computeBurnRateMetrics(november(10, 0), 10000, 2026, NOV, {
      today: at(10),
      fixedItems: [{ day: 3, amount: 12000, paid: false }],
    });
    expect(m?.flexibleAllowance).toBe(0);
    expect(m?.idealPace).toBe(12000);
  });
});

describe("fixedPlanFromOccurrences", () => {
  const occ = (over: Partial<RecurringOccurrence>): RecurringOccurrence => ({
    id: "a",
    kind: "subscription",
    name: "Rent",
    amount: "15000.00",
    category: null,
    due_date: "2026-11-05",
    status: "upcoming",
    ...over,
  });

  it("takes paid (at the posted amount) and upcoming expenses; skips skipped items and income", () => {
    const plan = fixedPlanFromOccurrences([
      occ({}),
      occ({
        id: "b",
        status: "paid",
        amount: "799.00",
        posted_amount: "649.00",
        due_date: "2026-11-02",
      }),
      occ({ id: "c", status: "skipped" }),
      occ({ id: "d", kind: "income", amount: "50000.00" }),
    ]);
    expect(plan).toEqual([
      { day: 5, amount: 15000, paid: false },
      { day: 2, amount: 649, paid: true },
    ]);
    expect(fixedPlanFromOccurrences(undefined)).toEqual([]);
  });
});
