import type {
  ForecastCategory,
  ForecastLanding,
  ForecastUpcomingItem,
} from "../../types";
import {
  categoryReference,
  computeBandLayout,
  confidenceDots,
  formatAccuracyWithin,
  formatChance,
  formatRangeText,
  formatUpcomingDay,
  groupUpcomingByDate,
  sortCategoriesAhead,
  toRupees,
  weekdayName,
} from "../forecastFormat";

const landing = (over: Partial<ForecastLanding> = {}): ForecastLanding => ({
  p10: "27100.00",
  p50: "28900.00",
  p90: "31200.00",
  budget: "30000.00",
  chanceUnder: 0.71,
  spentSoFar: "18620.00",
  billsStillDue: "0.00",
  flexibleRemaining: "10280.00",
  ...over,
});

const upcoming = (
  id: string,
  date: string,
  kind: ForecastUpcomingItem["kind"] = "likely",
): ForecastUpcomingItem => ({ id, kind, name: id, amount: "100.00", date });

describe("forecast formatting", () => {
  it("reads rupees from decimal strings and ignores junk", () => {
    expect(toRupees("2890.50")).toBe(2890.5);
    expect(toRupees(null)).toBe(0);
    expect(toRupees("abc")).toBe(0);
    expect(weekdayName("Thu")).toBe("Thursday");
  });

  it("writes the range, the chance and the accuracy as text", () => {
    expect(formatRangeText("27100.00", "31200.00")).toBe(
      "₹ 27,100 – ₹ 31,200",
    );
    expect(formatChance(0.714)).toBe("71%");
    expect(formatAccuracyWithin(5.2)).toBe("6%");
    expect(formatAccuracyWithin(0)).toBe("1%");
  });

  it("labels days against the server's today", () => {
    expect(formatUpcomingDay("2026-10-22", "2026-10-22")).toBe("Today");
    expect(formatUpcomingDay("2026-10-23", "2026-10-22")).toBe("Tomorrow");
    expect(formatUpcomingDay("2026-10-24", "2026-10-22")).toBe("Sat, 24 Oct");
    // Across a month end.
    expect(formatUpcomingDay("2026-11-01", "2026-10-31")).toBe("Tomorrow");
  });

  it("groups the next 14 days by date, soonest first, keeping the server's order within a day", () => {
    const groups = groupUpcomingByDate(
      [
        upcoming("c", "2026-10-25"),
        upcoming("a", "2026-10-23", "bill"),
        upcoming("b", "2026-10-23"),
      ],
      "2026-10-22",
    );
    expect(groups.map((g) => g.label)).toEqual(["Tomorrow", "Sun, 25 Oct"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groupUpcomingByDate([], "2026-10-22")).toEqual([]);
  });

  it("maps confidence to one to three dots", () => {
    expect(confidenceDots(0.62)).toBe(1);
    expect(confidenceDots(0.7)).toBe(2);
    expect(confidenceDots(0.9)).toBe(3);
    expect(confidenceDots(undefined)).toBe(1);
  });
});

describe("computeBandLayout", () => {
  it("keeps every mark inside the track in the right order", () => {
    const layout = computeBandLayout(landing());
    for (const value of [layout.spent, layout.bandStart, layout.bandEnd, layout.p50]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(layout.spent).toBeLessThan(layout.bandStart);
    expect(layout.bandStart).toBeLessThan(layout.p50);
    expect(layout.p50).toBeLessThan(layout.bandEnd);
    expect(layout.budget).not.toBeNull();
    expect(layout.budget).toBeGreaterThan(layout.p50);
    expect(layout.budget).toBeLessThan(layout.bandEnd);
  });

  it("starts the track at zero, so the spent fill is spent against the same scale as the rest", () => {
    const layout = computeBandLayout(
      landing({ spentSoFar: "1000.00", p10: "2000.00", p50: "3000.00", p90: "4000.00", budget: "5000.00" }),
    );
    // The track ends 8% past the highest figure (5000): every fraction is value / 5400.
    expect(layout.spent).toBeCloseTo(1000 / 5400);
    expect(layout.bandStart).toBeCloseTo(2000 / 5400);
    expect(layout.p50).toBeCloseTo(3000 / 5400);
    expect(layout.bandEnd).toBeCloseTo(4000 / 5400);
    expect(layout.budget).toBeCloseTo(5000 / 5400);
    expect(layout.budget).toBeLessThan(1);
    // Nothing spent: no fill; nothing at all: still finite.
    expect(computeBandLayout(landing({ spentSoFar: "0.00" })).spent).toBe(0);
    expect(computeBandLayout(landing({ budget: null, p10: "0.00", p50: "0.00", p90: "0.00", spentSoFar: "0.00" })).p50).toBe(0);
  });

  it("has no budget mark without a budget, and survives a flat range", () => {
    const flat = computeBandLayout(
      landing({ budget: null, p10: "100.00", p50: "100.00", p90: "100.00", spentSoFar: "100.00" }),
    );
    expect(flat.budget).toBeNull();
    expect(Number.isFinite(flat.p50)).toBe(true);
    expect(computeBandLayout(landing({ budget: "0.00" })).budget).toBeNull();
  });
});

describe("categories ahead", () => {
  const category = (over: Partial<ForecastCategory>): ForecastCategory => ({
    id: "c",
    name: "Food",
    iconName: null,
    color: null,
    spent: "100.00",
    p50: "200.00",
    budget: null,
    baseline: null,
    status: "ok",
    ...over,
  });

  it("puts what needs attention first, then the bigger projection", () => {
    const sorted = sortCategoriesAhead([
      category({ name: "ok-big", p50: "900.00" }),
      category({ name: "hot", status: "hot", p50: "100.00" }),
      category({ name: "over", status: "over", p50: "50.00" }),
      category({ name: "ok-small", p50: "10.00" }),
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["over", "hot", "ok-big", "ok-small"]);
  });

  it("measures against the budget, else the usual spend, else nothing", () => {
    expect(categoryReference(category({ budget: "500.00", baseline: "300.00" }))).toEqual({
      label: "budget",
      amount: 500,
    });
    expect(categoryReference(category({ baseline: "300.00" }))).toEqual({
      label: "usual",
      amount: 300,
    });
    expect(categoryReference(category({ budget: "0.00" }))).toBeNull();
  });
});
