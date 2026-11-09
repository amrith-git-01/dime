import { formatInrCompact } from "@/utils/currency";

import type { TransactionRow } from "../../types";
import {
  buildCategoryMonthView,
  capState,
  clampMonth,
  compareSpend,
  comparisonWindow,
  countCategoryDebits,
  earliestSelectableMonth,
  monthClock,
  paceLine,
  shiftMonth,
  sumCategoryDebitsOnDay,
  sumCategoryDebitsUpToDay,
  type CategoryMonthViewInput,
  type Loadable,
} from "../categoryMonthStats";

const money = (rupees: number) => formatInrCompact(rupees);
const paise = (rupees: number) => rupees * 100;
const ready = <T,>(value: T): Loadable<T> => ({ status: "ready", value });
const loading: Loadable<never> = { status: "loading" };
const failed: Loadable<never> = { status: "error" };

// Local dates, so the tests do not depend on the machine's time zone.
const at = (year: number, monthIndex0: number, day: number, hour = 12) =>
  new Date(year, monthIndex0, day, hour);

function row(over: Partial<TransactionRow> & { when: Date; amount: string }): TransactionRow {
  const { when, ...rest } = over;
  return {
    id: `${when.getTime()}-${over.amount}`,
    type: "debit",
    category_id: "cat-1",
    transaction_at: when.toISOString(),
    ...rest,
  } as TransactionRow;
}

describe("shiftMonth / earliestSelectableMonth", () => {
  it("steps across year boundaries", () => {
    expect(shiftMonth({ year: 2026, monthIndex0: 0 }, -1)).toEqual({ year: 2025, monthIndex0: 11 });
    expect(shiftMonth({ year: 2026, monthIndex0: 11 }, 1)).toEqual({ year: 2027, monthIndex0: 0 });
    expect(shiftMonth({ year: 2026, monthIndex0: 5 }, -17)).toEqual({ year: 2025, monthIndex0: 0 });
  });

  it("reaches 11 months back, or the route's month when that is older", () => {
    const current = { year: 2026, monthIndex0: 10 };
    expect(earliestSelectableMonth({ year: 2026, monthIndex0: 9 }, current)).toEqual({
      year: 2025,
      monthIndex0: 11,
    });
    expect(earliestSelectableMonth({ year: 2025, monthIndex0: 3 }, current)).toEqual({
      year: 2025,
      monthIndex0: 3,
    });
  });
});

describe("clampMonth", () => {
  const earliest = { year: 2025, monthIndex0: 11 };
  const latest = { year: 2026, monthIndex0: 10 };
  it("keeps a month inside the window and pulls others to its ends", () => {
    expect(clampMonth({ year: 2026, monthIndex0: 3 }, earliest, latest)).toEqual({ year: 2026, monthIndex0: 3 });
    expect(clampMonth({ year: 2027, monthIndex0: 0 }, earliest, latest)).toEqual(latest);
    expect(clampMonth({ year: 2024, monthIndex0: 5 }, earliest, latest)).toEqual(earliest);
  });
});

describe("monthClock", () => {
  it("counts the days left including today in the current month", () => {
    expect(monthClock({ year: 2026, monthIndex0: 10 }, at(2026, 10, 8))).toEqual({
      isCurrent: true,
      daysInMonth: 30,
      dayOfMonth: 8,
      daysRemaining: 23,
    });
    expect(monthClock({ year: 2026, monthIndex0: 10 }, at(2026, 10, 30)).daysRemaining).toBe(1);
  });

  it("has no day counters for a past month and knows leap Februaries", () => {
    expect(monthClock({ year: 2026, monthIndex0: 9 }, at(2026, 10, 8))).toEqual({
      isCurrent: false,
      daysInMonth: 31,
      dayOfMonth: null,
      daysRemaining: null,
    });
    expect(monthClock({ year: 2028, monthIndex0: 1 }, at(2028, 5, 1)).daysInMonth).toBe(29);
    expect(monthClock({ year: 2026, monthIndex0: 1 }, at(2026, 5, 1)).daysInMonth).toBe(28);
  });
});

describe("capState", () => {
  it("is accent with money left", () => {
    const state = capState(paise(5958), paise(10000));
    expect(state.tone).toBe("accent");
    expect(state.over).toBe(false);
    expect(state.progress).toBeCloseTo(0.5958);
    expect(state.metaLine).toBe(`${money(4042)} left of ${money(10000)} · 60%`);
  });

  it("turns warning above 80% and stays warning at exactly the cap", () => {
    expect(capState(paise(8000), paise(10000)).tone).toBe("accent");
    expect(capState(paise(8100), paise(10000)).tone).toBe("warning");
    const atCap = capState(paise(10000), paise(10000));
    expect(atCap.tone).toBe("warning");
    expect(atCap.metaLine).toBe(`${money(0)} left of ${money(10000)} · 100%`);
  });

  it("is danger and says how far over once the cap is passed", () => {
    const state = capState(paise(12500), paise(10000));
    expect(state.tone).toBe("danger");
    expect(state.over).toBe(true);
    expect(state.progress).toBe(1);
    expect(state.metaLine).toBe(`${money(2500)} over ${money(10000)} · 125%`);
  });

  it("shows an untouched cap as 0%", () => {
    const state = capState(0, paise(10000));
    expect(state.progress).toBe(0);
    expect(state.metaLine).toBe(`${money(10000)} left of ${money(10000)} · 0%`);
  });
});

describe("paceLine", () => {
  it("spreads what is left over the days left, rounded down", () => {
    expect(paceLine(paise(4042), 22)).toBe(`${money(183)}/day for the next 22 days`);
  });

  it("uses the singular for the last day", () => {
    expect(paceLine(paise(500), 1)).toBe(`${money(500)}/day for the next 1 day`);
  });

  it("is absent with nothing left or under a rupee a day", () => {
    expect(paceLine(0, 10)).toBeNull();
    expect(paceLine(paise(-50), 10)).toBeNull();
    expect(paceLine(paise(5), 10)).toBeNull();
    expect(paceLine(paise(100), 0)).toBeNull();
  });
});

describe("comparisonWindow", () => {
  it("compares the current month day 1..today with the same days last month", () => {
    expect(comparisonWindow({ year: 2026, monthIndex0: 10 }, at(2026, 10, 8))).toEqual({
      previousMonth: { year: 2026, monthIndex0: 9 },
      mode: "to-date",
      cutoffDay: 8,
    });
  });

  it("clamps to a shorter previous month (the 31st against a 30-day month)", () => {
    // 31 October against September (30 days).
    expect(comparisonWindow({ year: 2026, monthIndex0: 9 }, at(2026, 9, 31))).toEqual({
      previousMonth: { year: 2026, monthIndex0: 8 },
      mode: "to-date",
      cutoffDay: 30,
    });
    // 30 March against February (28 days).
    expect(comparisonWindow({ year: 2026, monthIndex0: 2 }, at(2026, 2, 30)).cutoffDay).toBe(28);
    // And a leap February.
    expect(comparisonWindow({ year: 2028, monthIndex0: 2 }, at(2028, 2, 31)).cutoffDay).toBe(29);
  });

  it("compares a past month in full with the month before it", () => {
    expect(comparisonWindow({ year: 2026, monthIndex0: 2 }, at(2026, 10, 8))).toEqual({
      previousMonth: { year: 2026, monthIndex0: 1 },
      mode: "full",
      cutoffDay: 28,
    });
  });

  it("crosses the year boundary", () => {
    expect(comparisonWindow({ year: 2026, monthIndex0: 0 }, at(2026, 0, 15)).previousMonth).toEqual({
      year: 2025,
      monthIndex0: 11,
    });
  });
});

describe("sums", () => {
  const rows = [
    row({ when: at(2026, 9, 1), amount: "100.00" }),
    row({ when: at(2026, 9, 8, 23), amount: "50.50" }),
    row({ when: at(2026, 9, 9), amount: "70.00" }),
    row({ when: at(2026, 9, 3), amount: "999.00", category_id: "other" }),
    row({ when: at(2026, 9, 3), amount: "10.00", type: "credit" }),
    row({ when: at(2026, 9, 4), amount: "20.00", category_id: null }),
  ];
  const october = { year: 2026, monthIndex0: 9 };

  it("sums one category's debits through the cutoff day, inclusive", () => {
    expect(sumCategoryDebitsUpToDay(rows, "cat-1", october, 8)).toBe(15050);
    expect(sumCategoryDebitsUpToDay(rows, "cat-1", october, 31)).toBe(22050);
    expect(sumCategoryDebitsUpToDay(rows, "cat-1", october, 0)).toBe(0);
  });

  it("matches uncategorized rows by the pseudo key", () => {
    expect(sumCategoryDebitsUpToDay(rows, "__uncategorized__", october, 31)).toBe(2000);
  });

  it("ignores rows from another month", () => {
    expect(sumCategoryDebitsUpToDay(rows, "cat-1", { year: 2026, monthIndex0: 8 }, 31)).toBe(0);
  });

  it("counts debits of the category only (a refund is not a payment)", () => {
    expect(countCategoryDebits(rows, "cat-1")).toBe(3);
    expect(countCategoryDebits(rows, "__uncategorized__")).toBe(1);
  });

  it("sums one local day", () => {
    expect(sumCategoryDebitsOnDay(rows, "cat-1", "2026-10-08")).toBe(5050);
    expect(sumCategoryDebitsOnDay(rows, "cat-1", "2026-10-02")).toBe(0);
  });
});

describe("compareSpend", () => {
  it("is none when the earlier period had no spend", () => {
    expect(compareSpend(paise(500), 0)).toEqual({ kind: "none" });
    expect(compareSpend(0, 0)).toEqual({ kind: "none" });
  });

  it("is more, less or the same", () => {
    expect(compareSpend(paise(2000), paise(790))).toEqual({ kind: "more", deltaPaise: paise(1210) });
    expect(compareSpend(paise(100), paise(900))).toEqual({ kind: "less", deltaPaise: paise(800) });
    expect(compareSpend(paise(900), paise(900))).toEqual({ kind: "same" });
  });

  it("judges on the rupees shown, so a few paise do not read as a change", () => {
    expect(compareSpend(90020, 90000)).toEqual({ kind: "same" });
    expect(compareSpend(0, paise(300))).toEqual({ kind: "less", deltaPaise: paise(300) });
  });
});

describe("buildCategoryMonthView", () => {
  const november = { year: 2026, monthIndex0: 10 };
  const october = { year: 2026, monthIndex0: 9 };
  const now = at(2026, 10, 8);

  function input(over: Partial<CategoryMonthViewInput> = {}): CategoryMonthViewInput {
    return {
      month: november,
      now,
      cap: ready(paise(10000)),
      canSetCap: true,
      spentPaise: ready(paise(5958)),
      comparedPaise: ready(paise(5958)),
      comparable: true,
      todayPaise: ready(0),
      payments: ready({ count: 7, hasMore: false }),
      previousPaise: ready(paise(4748)),
      ...over,
    };
  }

  it("builds the current month with a cap", () => {
    const view = buildCategoryMonthView(input());
    expect(view.hero).toBe(money(5958));
    expect(view.over).toBe(false);
    expect(view.cap).toEqual({
      state: "ready",
      progress: expect.closeTo(0.5958),
      tone: "accent",
      metaLine: `${money(4042)} left of ${money(10000)} · 60%`,
    });
    // 4042 over the 23 days left (8 November to 30 November), rounded down.
    expect(view.paceLine).toBe(`${money(175)}/day for the next 23 days`);
    expect(view.offerSetCap).toBe(false);
    expect(view.stats.primary).toEqual({ label: "Today", value: money(0) });
    expect(view.stats.payments).toEqual({ label: "Payments", value: "7" });
    expect(view.stats.compare).toMatchObject({
      label: "vs Oct",
      value: `▲ ${money(1210)}`,
      tone: "danger",
      accessibilityLabel: `${money(1210)} more than by 8 October`,
    });
  });

  it("marks a spend over the cap in danger with no pace", () => {
    const view = buildCategoryMonthView(input({ spentPaise: ready(paise(12000)) }));
    expect(view.over).toBe(true);
    expect(view.cap).toMatchObject({
      tone: "danger",
      progress: 1,
      metaLine: `${money(2000)} over ${money(10000)} · 120%`,
    });
    expect(view.paceLine).toBeNull();
  });

  it("offers to set a cap when there is none, and has no bar or pace", () => {
    const view = buildCategoryMonthView(input({ cap: ready(null) }));
    expect(view.cap).toBeNull();
    expect(view.offerSetCap).toBe(true);
    expect(view.paceLine).toBeNull();
  });

  it("offers nothing for a category that cannot have a cap (uncategorized)", () => {
    const view = buildCategoryMonthView(input({ cap: ready(null), canSetCap: false }));
    expect(view.cap).toBeNull();
    expect(view.offerSetCap).toBe(false);
  });

  it("swaps Today for Avg/day and drops the pace in a past month, comparing in full", () => {
    const view = buildCategoryMonthView(
      input({
        month: october,
        spentPaise: ready(paise(3100)),
        comparedPaise: ready(paise(3100)),
        previousPaise: ready(paise(3900)),
      }),
    );
    expect(view.paceLine).toBeNull();
    expect(view.stats.primary).toEqual({ label: "Avg/day", value: money(100) });
    expect(view.stats.compare).toMatchObject({
      label: "vs Sep",
      value: `▼ ${money(800)}`,
      tone: "success",
      accessibilityLabel: `${money(800)} less than September`,
    });
  });

  it("says Same when equal and a dash when last month had nothing", () => {
    expect(
      buildCategoryMonthView(input({ previousPaise: ready(paise(5958)) })).stats.compare,
    ).toMatchObject({ value: "Same", tone: "neutral", accessibilityLabel: "Same as by 8 October" });
    expect(buildCategoryMonthView(input({ previousPaise: ready(0) })).stats.compare).toMatchObject({
      value: "—",
      tone: "neutral",
    });
  });

  it("marks a '+' on the payment count while more rows are to come", () => {
    const view = buildCategoryMonthView(input({ payments: ready({ count: 50, hasMore: true }) }));
    expect(view.stats.payments.value).toBe("50+");
  });

  it("uses skeleton values (null) while loading", () => {
    const view = buildCategoryMonthView(
      input({
        cap: loading,
        spentPaise: loading,
        todayPaise: loading,
        payments: loading,
        previousPaise: loading,
      }),
    );
    expect(view.hero).toBeNull();
    expect(view.cap).toEqual({ state: "loading" });
    expect(view.stats.primary.value).toBeNull();
    expect(view.stats.payments.value).toBeNull();
    expect(view.stats.compare.value).toBeNull();
  });

  it("keeps the compare stat loading until both months are in", () => {
    expect(buildCategoryMonthView(input({ previousPaise: loading })).stats.compare.value).toBeNull();
    expect(buildCategoryMonthView(input({ comparedPaise: loading })).stats.compare.value).toBeNull();
  });

  it("shows dashes when a query failed", () => {
    const view = buildCategoryMonthView(
      input({
        spentPaise: failed,
        comparedPaise: failed,
        todayPaise: failed,
        payments: failed,
        previousPaise: failed,
      }),
    );
    expect(view.hero).toBe("—");
    expect(view.cap).toMatchObject({ state: "ready", metaLine: "—" });
    expect(view.paceLine).toBeNull();
    expect(view.stats.primary.value).toBe("—");
    expect(view.stats.payments.value).toBe("—");
    expect(view.stats.compare.value).toBe("—");
  });

  it("compares the to-date side, not the whole month's hero, and keeps 'left' on the hero", () => {
    // 2000 of the 5958 is dated after today; the comparison counts only what is spent to date.
    const view = buildCategoryMonthView(input({ comparedPaise: ready(paise(3958)) }));
    expect(view.hero).toBe(money(5958));
    expect(view.cap).toMatchObject({ metaLine: `${money(4042)} left of ${money(10000)} · 60%` });
    expect(view.stats.compare.value).toBe(`▼ ${money(790)}`);
  });

  it("shows no comparison where there is none to make (uncategorized, current month)", () => {
    const view = buildCategoryMonthView(input({ comparable: false, previousPaise: loading }));
    expect(view.stats.compare).toMatchObject({
      label: "vs Oct",
      value: "—",
      tone: "neutral",
      accessibilityLabel: "No comparison",
    });
  });

  it("shows no cap section if the budgets could not be loaded", () => {
    const view = buildCategoryMonthView(input({ cap: failed }));
    expect(view.cap).toBeNull();
    expect(view.offerSetCap).toBe(false);
  });
});
