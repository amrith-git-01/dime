import type { TransactionRow } from "../../types";
import {
  amountAtIndex,
  amountBoundsFromValues,
  amountIndexOf,
  amountStepForSpan,
  amountValuesFromBounds,
  buildAmountDomain,
  nudgeAmountThumb,
  snapThumbIndex,
  type AmountDomain,
} from "../amountRange";
import { applyListCriteria, DEFAULT_LIST_CRITERIA } from "../monthListFilter";

type Row = Pick<TransactionRow, "type" | "amount">;
const debit = (amount: string): Row => ({ type: "debit", amount });
const credit = (amount: string): Row => ({ type: "credit", amount });
const bounds = (min: number | null, max: number | null) => ({
  amountMinPaise: min,
  amountMaxPaise: max,
});

describe("amountStepForSpan", () => {
  it("steps by rupees 10 / 50 / 100 / 500 as the span grows", () => {
    expect(amountStepForSpan(50_000)).toBe(1_000);
    expect(amountStepForSpan(100_000)).toBe(1_000);
    expect(amountStepForSpan(100_100)).toBe(5_000);
    expect(amountStepForSpan(1_000_000)).toBe(5_000);
    expect(amountStepForSpan(5_000_000)).toBe(10_000);
    expect(amountStepForSpan(10_000_000)).toBe(10_000);
    expect(amountStepForSpan(50_000_000)).toBe(50_000);
  });
});

describe("buildAmountDomain", () => {
  it("spans the expenses only, rounded outward to the step", () => {
    const domain = buildAmountDomain([
      debit("123.40"),
      debit("-980.00"),
      credit("50000.00"),
      credit("1.00"),
    ]);
    // Span 856.60 rupees: step 10, so 120 to 980.
    expect(domain).toEqual({ minPaise: 12_000, maxPaise: 98_000, stepPaise: 1_000, steps: 86 });
  });

  it("uses a coarser step for a wide span", () => {
    const domain = buildAmountDomain([debit("40.00"), debit("15250.00")]);
    expect(domain).toEqual({ minPaise: 0, maxPaise: 1_530_000, stepPaise: 10_000, steps: 153 });
  });

  it("is null with no expenses, one amount, or fewer than two steps", () => {
    expect(buildAmountDomain([])).toBeNull();
    expect(buildAmountDomain([credit("500.00"), credit("900.00")])).toBeNull();
    expect(buildAmountDomain([debit("500.00")])).toBeNull();
    expect(buildAmountDomain([debit("500.00"), debit("500.00")])).toBeNull();
    // 505 and 508 both round into the same ten-rupee step.
    expect(buildAmountDomain([debit("505.00"), debit("508.00")])).toBeNull();
    expect(buildAmountDomain([debit("505.00"), debit("525.00")])).not.toBeNull();
  });

  it("keeps every expense inside the domain", () => {
    const rows = [debit("3.50"), debit("99.99"), debit("1234.56")];
    const domain = buildAmountDomain(rows) as AmountDomain;
    expect(domain.minPaise).toBeLessThanOrEqual(350);
    expect(domain.maxPaise).toBeGreaterThanOrEqual(123_456);
    expect((domain.maxPaise - domain.minPaise) % domain.stepPaise).toBe(0);
  });

  describe("with an active bound", () => {
    const month = [debit("200.00"), debit("800.00")];

    it("is unchanged by bounds inside the expenses", () => {
      expect(buildAmountDomain(month, bounds(30_000, 70_000))).toEqual(buildAmountDomain(month));
    });

    it("widens to contain a bound from another month", () => {
      // Bounds from a bigger month: 450 to 3,000 against a 200 to 800 month.
      const domain = buildAmountDomain(month, bounds(45_000, 300_000)) as AmountDomain;
      expect(domain.minPaise).toBeLessThanOrEqual(20_000);
      expect(domain.maxPaise).toBeGreaterThanOrEqual(300_000);
      expect(amountValuesFromBounds(domain, bounds(45_000, 300_000))).toEqual({ low: 45_000, high: 300_000 });
    });

    it("widens below the expenses, and ignores a bound when there are no expenses", () => {
      const domain = buildAmountDomain(month, bounds(null, 5_000)) as AmountDomain;
      expect(domain.minPaise).toBe(5_000);
      expect(domain.maxPaise).toBeGreaterThanOrEqual(80_000);
      expect(buildAmountDomain([credit("100.00")], bounds(1_000, 9_000))).toBeNull();
    });

    it("moves the step from 10 to 50 rupees when the bound makes the span wider", () => {
      // 200 to 800: a 600-rupee span, ten-rupee steps.
      expect(buildAmountDomain(month)?.stepPaise).toBe(1_000);
      // A 3,000 bound makes it 2,800 rupees: fifty-rupee steps, and the bound stays inside.
      const wide = buildAmountDomain(month, bounds(null, 300_000)) as AmountDomain;
      expect(wide.stepPaise).toBe(5_000);
      expect(wide.maxPaise).toBeGreaterThanOrEqual(300_000);
      expect((wide.maxPaise - wide.minPaise) % wide.stepPaise).toBe(0);
    });

    it("keeps a bound that is not on the new step grid exactly as it is", () => {
      // 1,230 is a multiple of 10 rupees, but not of the 50-rupee step the wider domain uses.
      const domain = buildAmountDomain([debit("100.00"), debit("1500.00"), debit("2900.00")]) as AmountDomain;
      expect(domain.stepPaise).toBe(5_000);
      const values = amountValuesFromBounds(domain, bounds(123_000, null));
      expect(values.low).toBe(123_000);
      expect(values.high).toBe(domain.maxPaise);
    });
  });
});

describe("index mapping", () => {
  const domain: AmountDomain = { minPaise: 10_000, maxPaise: 60_000, stepPaise: 5_000, steps: 10 };

  it("converts between indices and amounts, clamped to the domain", () => {
    expect(amountAtIndex(domain, 0)).toBe(10_000);
    expect(amountAtIndex(domain, 4)).toBe(30_000);
    expect(amountAtIndex(domain, 99)).toBe(60_000);
    expect(amountAtIndex(domain, -3)).toBe(10_000);
    expect(amountIndexOf(domain, 30_000)).toBe(4);
    expect(amountIndexOf(domain, 32_400)).toBe(4);
    expect(amountIndexOf(domain, 1)).toBe(0);
    expect(amountIndexOf(domain, 9_999_999)).toBe(10);
  });

  it("writes a bound only for a thumb that left its end (full range is no filter)", () => {
    expect(amountBoundsFromValues(domain, 10_000, 60_000)).toEqual(bounds(null, null));
    expect(amountBoundsFromValues(domain, 20_000, 60_000)).toEqual(bounds(20_000, null));
    expect(amountBoundsFromValues(domain, 10_000, 45_000)).toEqual(bounds(null, 45_000));
    // An exact value off the grid is passed through, never snapped.
    expect(amountBoundsFromValues(domain, 21_234, 45_000)).toEqual(bounds(21_234, 45_000));
  });

  it("puts the thumbs at the actual bounds", () => {
    expect(amountValuesFromBounds(domain, bounds(null, null))).toEqual({ low: 10_000, high: 60_000 });
    expect(amountValuesFromBounds(domain, bounds(21_234, 45_000))).toEqual({ low: 21_234, high: 45_000 });
  });

  it("pulls crossed bounds apart by a step", () => {
    expect(amountValuesFromBounds(domain, bounds(9_999_999, null))).toEqual({ low: 55_000, high: 60_000 });
    expect(amountValuesFromBounds(domain, bounds(null, 1))).toEqual({ low: 10_000, high: 15_000 });
  });

  it("round-trips through the list filter: thumb bounds select the expenses between them", () => {
    const rows = [
      { id: "a", type: "debit", amount: "150.00" },
      { id: "b", type: "debit", amount: "300.00" },
      { id: "c", type: "debit", amount: "600.00" },
    ] as unknown as TransactionRow[];
    const filter = amountBoundsFromValues(domain, 20_000, 45_000);
    const ids = applyListCriteria(rows, { ...DEFAULT_LIST_CRITERIA, ...filter }).map((r) => r.id);
    expect(ids).toEqual(["b"]);
  });
});

describe("snapThumbIndex", () => {
  it("rounds to the nearest step, a step clear of the other thumb", () => {
    expect(snapThumbIndex(0, 0.34, 1, 10)).toBe(3);
    expect(snapThumbIndex(1, 0.66, 0, 10)).toBe(7);
    expect(snapThumbIndex(0, 0.95, 0.5, 10)).toBe(4);
    expect(snapThumbIndex(1, 0.05, 0.5, 10)).toBe(6);
    // The other thumb between two steps: stay on the side that keeps a full step.
    expect(snapThumbIndex(0, 0.55, 0.56, 10)).toBe(4);
    expect(snapThumbIndex(1, 0.55, 0.54, 10)).toBe(7);
  });
});

describe("nudgeAmountThumb", () => {
  const domain: AmountDomain = { minPaise: 10_000, maxPaise: 60_000, stepPaise: 5_000, steps: 10 };

  it("moves a thumb one step and leaves the other value exactly as it was", () => {
    expect(nudgeAmountThumb(domain, "low", 10_000, 47_321, 1)).toEqual({ low: 15_000, high: 47_321 });
    expect(nudgeAmountThumb(domain, "high", 20_000, 47_321, -1)).toEqual({ low: 20_000, high: 45_000 });
    expect(nudgeAmountThumb(domain, "high", 20_000, 47_321, 1)).toEqual({ low: 20_000, high: 50_000 });
  });

  it("goes to the next grid point from an off-grid value", () => {
    expect(nudgeAmountThumb(domain, "low", 21_234, 60_000, 1)).toEqual({ low: 25_000, high: 60_000 });
    expect(nudgeAmountThumb(domain, "low", 21_234, 60_000, -1)).toEqual({ low: 20_000, high: 60_000 });
  });

  it("does not move past an end or within a step of the other thumb", () => {
    expect(nudgeAmountThumb(domain, "low", 10_000, 60_000, -1)).toEqual({ low: 10_000, high: 60_000 });
    expect(nudgeAmountThumb(domain, "high", 10_000, 60_000, 1)).toEqual({ low: 10_000, high: 60_000 });
    expect(nudgeAmountThumb(domain, "low", 50_000, 55_000, 1)).toEqual({ low: 50_000, high: 55_000 });
    expect(nudgeAmountThumb(domain, "high", 50_000, 55_000, -1)).toEqual({ low: 50_000, high: 55_000 });
  });
});
