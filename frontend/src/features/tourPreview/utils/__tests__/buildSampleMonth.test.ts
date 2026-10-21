import { format, parseISO } from "date-fns";

import type { CategoryRow } from "@/features/categories/types";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";

import {
  CATEGORY_SPEND,
  MONTH_BUDGET,
  MONTH_RECURRING,
  MONTH_TOTAL,
  REEL_PAYEES,
} from "@/features/onboarding/components/reel/reelStory";

import {
  buildSampleMonth,
  buildSampleSet,
  isSampleMonth,
  pickSampleMonth,
} from "../buildSampleMonth";
import { isTourSampleId, TOUR_SAMPLE_ID_PREFIX, tourSampleId } from "../sampleIds";

const TZ = "Asia/Kolkata";

const cents = (amount: string): number => Math.round(Number.parseFloat(amount) * 100);
const dayOf = (iso: string): string => format(parseISO(iso), "yyyy-MM-dd");
const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

/** Mid-month, the 1st, the days the recurring bills post, the last day, and a short month. */
const TODAYS: [string, Date][] = [
  ["mid-month", new Date(2026, 9, 15)],
  ["the 1st", new Date(2026, 9, 1)],
  ["the 2nd", new Date(2026, 9, 2)],
  ["the 3rd", new Date(2026, 9, 3)],
  ["the last day", new Date(2026, 9, 31)],
  ["the end of February", new Date(2026, 1, 28)],
];

describe.each(TODAYS)("buildSampleMonth (%s)", (_label, today) => {
  const sample = buildSampleMonth({ today, timezone: TZ });
  const items = sample.monthPages.pages[0].items;
  const todayKey = format(today, "yyyy-MM-dd");
  const debits = items.filter((tx) => tx.type === "debit");
  const credits = items.filter((tx) => tx.type === "credit");
  const fixed = (tx: (typeof items)[number]) => tx.category_scope !== "spend";

  it("is for the current month only", () => {
    expect(sample.year).toBe(today.getFullYear());
    expect(sample.monthIndex0).toBe(today.getMonth());
    expect(isSampleMonth(sample, today.getFullYear(), today.getMonth())).toBe(true);
    expect(isSampleMonth(sample, today.getFullYear(), today.getMonth() - 1)).toBe(false);
    expect(isSampleMonth(sample, today.getFullYear() - 1, today.getMonth())).toBe(false);
  });

  it("only has rows in this month, on or before today", () => {
    expect(items.length).toBeGreaterThan(0);
    for (const tx of items) {
      expect(dayOf(tx.transaction_at) >= format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd")).toBe(true);
      expect(dayOf(tx.transaction_at) <= todayKey).toBe(true);
    }
  });

  it("is sorted newest first with unique, recognisable ids", () => {
    const times = items.map((tx) => tx.transaction_at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(new Set(items.map((tx) => tx.id)).size).toBe(items.length);
    for (const tx of items) {
      expect(isTourSampleId(tx.id)).toBe(true);
      expect(tx.id.startsWith(TOUR_SAMPLE_ID_PREFIX)).toBe(true);
    }
  });

  it("month summary adds up and splits into fixed + flexible", () => {
    const summary = sample.monthSummary;
    expect(summary.transaction_count).toBe(items.length);
    expect(summary.transaction_count).toBeGreaterThan(0);
    expect(cents(summary.debit_total)).toBe(sum(debits.map((tx) => cents(tx.amount))));
    expect(cents(summary.credit_total)).toBe(sum(credits.map((tx) => cents(tx.amount))));
    expect(cents(summary.net)).toBe(cents(summary.credit_total) - cents(summary.debit_total));
    expect(cents(summary.fixed_debit_total ?? "") + cents(summary.flexible_debit_total ?? "")).toBe(
      cents(summary.debit_total),
    );
    expect(cents(summary.fixed_credit_total ?? "") + cents(summary.flexible_credit_total ?? "")).toBe(
      cents(summary.credit_total),
    );
    expect(cents(summary.fixed_debit_total ?? "")).toBe(
      sum(debits.filter(fixed).map((tx) => cents(tx.amount))),
    );
    expect(cents(summary.fixed_credit_total ?? "")).toBe(
      sum(credits.filter(fixed).map((tx) => cents(tx.amount))),
    );
  });

  it("debit_by_category matches the rows and category_meta (with scope)", () => {
    const byCategory = sample.monthSummary.debit_by_category;
    expect(sum(Object.values(byCategory).map(cents))).toBe(cents(sample.monthSummary.debit_total));
    expect(UNCATEGORIZED_CATEGORY_KEY in byCategory).toBe(false);

    const meta = sample.monthSummary.category_meta ?? [];
    expect(meta.map((m) => m.id).sort()).toEqual(Object.keys(byCategory).sort());
    for (const entry of meta) {
      const row = debits.find((tx) => tx.category_id === entry.id);
      expect(entry.name).toBe(row?.category);
      expect(entry.scope).toBe(row?.category_scope);
    }
    expect(meta.some((m) => m.scope === "recurring_expense")).toBe(true);
    expect(meta.some((m) => m.scope === "spend")).toBe(true);

    expect(sample.debitTotalsByCategory).toEqual(
      Object.fromEntries(Object.entries(byCategory).map(([id, amount]) => [id, Number.parseFloat(amount)])),
    );
  });

  it("day summaries match the items day by day", () => {
    const summaries = sample.monthPages.pages[0].day_summaries ?? {};
    const days = [...new Set(items.map((tx) => dayOf(tx.transaction_at)))].sort();
    expect(Object.keys(summaries)).toEqual(days);
    for (const day of days) {
      const dayItems = items.filter((tx) => dayOf(tx.transaction_at) === day);
      const debit = sum(dayItems.filter((tx) => tx.type === "debit").map((tx) => cents(tx.amount)));
      const credit = sum(dayItems.filter((tx) => tx.type === "credit").map((tx) => cents(tx.amount)));
      expect(summaries[day]).toMatchObject({
        date: day,
        transaction_count: dayItems.length,
      });
      expect(cents(summaries[day].debit_total)).toBe(debit);
      expect(cents(summaries[day].credit_total)).toBe(credit);
      expect(cents(summaries[day].net)).toBe(credit - debit);
      expect(cents(summaries[day].fixed_debit_total ?? "")).toBe(
        sum(dayItems.filter((tx) => tx.type === "debit" && fixed(tx)).map((tx) => cents(tx.amount))),
      );
    }
    expect(sample.monthPages.pages).toHaveLength(1);
    expect(sample.monthPages.pages[0].has_more).toBe(false);
    expect(sample.monthPages.pageParams).toEqual([0]);
  });

  it("Home overview: exactly 7 days ending on device-local today, totals from the rows", () => {
    const home = sample.homeOverview;
    const series = home.last_7_days_spend ?? [];
    expect(series).toHaveLength(7);
    expect(series[6].date).toBe(todayKey);
    series.forEach((entry, index) => {
      if (index > 0) {
        expect(parseISO(entry.date).getTime() - parseISO(series[index - 1].date).getTime()).toBeGreaterThan(0);
      }
    });
    expect(cents(series[6].total)).toBe(
      sum(debits.filter((tx) => dayOf(tx.transaction_at) === todayKey).map((tx) => cents(tx.amount))),
    );
    expect(cents(home.spent_today)).toBe(cents(series[6].total));
    expect(cents(home.spent_this_month)).toBe(cents(sample.monthSummary.debit_total));
    expect(cents(home.fixed_spent_this_month ?? "")).toBe(cents(sample.monthSummary.fixed_debit_total ?? ""));
    expect(cents(home.flexible_spent_this_month ?? "")).toBe(cents(sample.monthSummary.flexible_debit_total ?? ""));
    expect(home.recent_transactions).toEqual(items.slice(0, 5));
  });

  it("Home top categories are everyday spend only, largest first", () => {
    const top = sample.homeOverview.top_categories;
    expect(top.length).toBeGreaterThan(0);
    const totals = top.map((entry) => cents(entry.total));
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    for (const entry of top) {
      const meta = sample.monthSummary.category_meta?.find((m) => m.id === entry.category_id);
      expect(meta?.scope).toBe("spend");
    }
  });

  it("recurring lists and the month view agree with the transactions", () => {
    const { recurringIncome, recurringSubscriptions, recurringMonth } = sample;
    expect(recurringIncome.items.map((item) => item.name)).toEqual(["Salary"]);
    expect(recurringSubscriptions.items.map((item) => item.name)).toEqual(["Broadband", "Netflix"]);
    expect(recurringIncome.summary).toEqual(recurringSubscriptions.summary);
    expect(cents(recurringIncome.summary.monthly_income_total)).toBe(
      sum(recurringIncome.items.map((item) => cents(item.monthly_equivalent))),
    );
    expect(cents(recurringIncome.summary.monthly_subscriptions_total)).toBe(
      sum(recurringSubscriptions.items.map((item) => cents(item.monthly_equivalent))),
    );
    for (const item of [...recurringIncome.items, ...recurringSubscriptions.items]) {
      expect(isTourSampleId(item.id)).toBe(true);
      expect(item.amount).toMatch(/^\d+\.\d{2}$/);
      expect(item.active).toBe(true);
      expect(item.timezone).toBe(TZ);
    }

    expect(recurringMonth.year).toBe(today.getFullYear());
    expect(recurringMonth.month).toBe(today.getMonth() + 1);
    const byName = Object.fromEntries(recurringMonth.items.map((o) => [o.name, o]));
    const prefix = format(today, "yyyy-MM");

    // The bills and the salary are posted early in the month (never after today), so they are all paid.
    for (const name of ["Broadband", "Netflix", "Salary"]) {
      expect(byName[name]).toMatchObject({ status: "paid" });
    }
    for (const occurrence of recurringMonth.items.filter((o) => o.status === "paid")) {
      const tx = items.find((candidate) => candidate.id === occurrence.transaction_id);
      expect(tx?.recurring_item_id).toBe(occurrence.id);
      expect(tx?.amount).toBe(occurrence.posted_amount);
      expect(dayOf(tx?.transaction_at ?? "")).toBe(occurrence.due_date);
    }
    for (const occurrence of recurringMonth.items.filter((o) => o.status === "upcoming")) {
      expect(occurrence.due_date > todayKey).toBe(true);
      expect(occurrence.due_date.startsWith(prefix)).toBe(true);
    }

    const paid = recurringMonth.items.filter((o) => o.status === "paid");
    const upcoming = recurringMonth.items.filter((o) => o.status === "upcoming");
    const sumOf = (rows: typeof paid, kind: "income" | "subscription") =>
      sum(rows.filter((o) => o.kind === kind).map((o) => cents(o.posted_amount ?? o.amount)));
    expect(cents(recurringMonth.totals.fixed_expense_paid)).toBe(sumOf(paid, "subscription"));
    expect(cents(recurringMonth.totals.fixed_income_received)).toBe(sumOf(paid, "income"));
    expect(cents(recurringMonth.totals.fixed_expense_upcoming)).toBe(sumOf(upcoming, "subscription"));
    expect(cents(recurringMonth.totals.fixed_income_upcoming)).toBe(sumOf(upcoming, "income"));
    // The fixed money in the transactions is exactly what the recurring items posted.
    expect(cents(sample.monthSummary.fixed_debit_total ?? "")).toBe(
      cents(recurringMonth.totals.fixed_expense_paid),
    );
    expect(cents(sample.monthSummary.fixed_credit_total ?? "")).toBe(
      cents(recurringMonth.totals.fixed_income_received),
    );

    const dates = recurringMonth.items.map((o) => o.due_date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("budgets are decimal strings tied to real categories", () => {
    expect(sample.budget.budget?.monthly_budget).toBe("30000.00");
    expect(isTourSampleId(sample.budget.budget?.id ?? "")).toBe(true);
    expect(sample.categoryBudgets.length).toBeGreaterThan(0);
    expect(sample.categoryBudgets[0].monthly_amount).toBe("8000.00");
    const spendIds = new Set(
      sample.monthSummary.category_meta?.filter((m) => m.scope === "spend").map((m) => m.id),
    );
    for (const entry of sample.categoryBudgets) {
      expect(spendIds.has(entry.category_id)).toBe(true);
    }
  });

  it("insights: full zero-filled month, flexible-only payees and top expenses", () => {
    const { insights } = sample;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    expect(insights).toMatchObject({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      today: todayKey,
    });
    expect(insights.summary.transaction_count).toBe(items.length);
    expect(cents(insights.summary.debit_total)).toBe(cents(sample.monthSummary.debit_total));
    expect(cents(insights.summary.fixed_debit_total ?? "")).toBe(cents(sample.monthSummary.fixed_debit_total ?? ""));

    expect(insights.daily_cashflow).toHaveLength(daysInMonth);
    insights.daily_cashflow.forEach((row, index) => {
      expect(row.date).toBe(`${format(today, "yyyy-MM")}-${String(index + 1).padStart(2, "0")}`);
    });
    expect(sum(insights.daily_cashflow.map((row) => cents(row.debit_total)))).toBe(
      cents(insights.summary.debit_total),
    );
    expect(sum(insights.daily_cashflow.map((row) => cents(row.credit_total)))).toBe(
      cents(insights.summary.credit_total),
    );
    expect(sum(insights.daily_cashflow.map((row) => cents(row.fixed_debit_total ?? "0")))).toBe(
      cents(insights.summary.fixed_debit_total ?? ""),
    );
    const future = insights.daily_cashflow.filter((row) => row.date > todayKey);
    for (const row of future) {
      expect(cents(row.debit_total) + cents(row.credit_total)).toBe(0);
    }

    const flexibleDebit = cents(insights.summary.flexible_debit_total ?? "");
    expect(sum(insights.counterparty_spend.map((row) => cents(row.debit_total)))).toBe(flexibleDebit);
    expect(sum(insights.counterparty_spend.map((row) => row.share))).toBeCloseTo(1, 2);
    expect(insights.counterparty_spend.some((row) => row.display_name === "Broadband")).toBe(false);
    expect(insights.counterparty_spend.length).toBeLessThanOrEqual(5);
    expect(sum(insights.counterparty_spend.map((row) => row.transaction_count))).toBe(
      debits.filter((tx) => !fixed(tx)).length,
    );

    expect(insights.counterparty_income).toHaveLength(1);
    expect(insights.counterparty_income[0]).toMatchObject({ display_name: "Salary", share: 1 });
    expect(cents(insights.counterparty_income[0].credit_total)).toBe(cents(insights.summary.credit_total));

    const top = insights.top_expenses;
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(5);
    expect(top.every((tx) => tx.type === "debit" && !fixed(tx))).toBe(true);
    const topAmounts = top.map((tx) => cents(tx.amount));
    expect([...topAmounts].sort((a, b) => b - a)).toEqual(topAmounts);
  });
});

describe("buildSampleMonth details", () => {
  it("posts the recurring bills and the salary early, so every day of the month tells the same story", () => {
    const totals = (today: Date) => {
      const { monthSummary } = buildSampleMonth({ today, timezone: TZ });
      return [monthSummary.debit_total, monthSummary.fixed_debit_total, monthSummary.credit_total];
    };
    const mid = totals(new Date(2026, 9, 15));
    expect(totals(new Date(2026, 9, 1))).toEqual(mid);
    expect(totals(new Date(2026, 9, 31))).toEqual(mid);
    const month = buildSampleMonth({ today: new Date(2026, 9, 5), timezone: TZ }).recurringMonth;
    expect(month.items.every((o) => o.status === "paid")).toBe(true);
    expect(cents(month.totals.fixed_expense_upcoming)).toBe(0);
  });

  it("is deterministic: the same day builds the same data", () => {
    const today = new Date(2026, 9, 15, 17, 30);
    expect(buildSampleMonth({ today, timezone: TZ })).toEqual(
      buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ }),
    );
  });

  it("never dates a sample row after now (early morning, and on the 1st)", () => {
    for (const now of [new Date(2026, 9, 15, 7, 0), new Date(2026, 9, 1, 9, 0)]) {
      const sample = buildSampleMonth({ today: now, now, timezone: TZ });
      const rows = sample.monthPages.pages.flatMap((p) => p.items);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Date.parse(row.transaction_at)).toBeLessThanOrEqual(now.getTime());
      }
    }
  });

  it("uses the app's real system categories when cached, else the built-in seed", () => {
    const seeded = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ });
    const food = seeded.monthSummary.category_meta?.find((m) => m.name === "Food & Dining");
    expect(food?.id).toBe("85bf877a-f8b1-4b07-a9fb-5e8c809907ae");
    expect(food?.icon_name).toBe("UtensilsCrossed");

    const cached: CategoryRow[] = [
      {
        id: tourSampleId(999),
        name: "Food & Dining",
        icon_name: "Soup",
        color: "#123456",
        is_system: true,
        scope: "spend",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ];
    const live = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ, categories: cached });
    const liveFood = live.monthSummary.category_meta?.find((m) => m.name === "Food & Dining");
    expect(liveFood).toMatchObject({ id: tourSampleId(999), icon_name: "Soup", color: "#123456" });
    expect(live.categoryBudgets[0].category_id).toBe(tourSampleId(999));
    expect(live.monthPages.pages[0].items.some((tx) => tx.category_id === tourSampleId(999))).toBe(true);
  });

  it("scales everyday spending for another month but keeps the recurring bills", () => {
    const base = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ });
    const more = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ, spendFactor: 2 });
    expect(cents(more.monthSummary.fixed_debit_total ?? "")).toBe(
      cents(base.monthSummary.fixed_debit_total ?? ""),
    );
    expect(cents(more.monthSummary.flexible_debit_total ?? "")).toBe(
      2 * cents(base.monthSummary.flexible_debit_total ?? ""),
    );
  });

  it("stamps the given user on the rows", () => {
    const sample = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ, userId: "user-a" });
    expect(sample.monthPages.pages[0].items.every((tx) => tx.user_id === "user-a")).toBe(true);
  });
});

describe("the sample tells the Welcome reel's October", () => {
  const sample = buildSampleMonth({ today: new Date(2026, 9, 15), timezone: TZ });
  const items = sample.monthPages.pages[0].items;
  const rupees = (amount: string): number => Math.round(Number.parseFloat(amount));
  const spentBy = (name: string) =>
    items
      .filter((tx) => tx.type === "debit" && tx.category === name)
      .reduce((total, tx) => total + rupees(tx.amount), 0);

  it("totals the reel's month, budget and recurring spend", () => {
    expect(rupees(sample.monthSummary.debit_total)).toBe(MONTH_TOTAL);
    expect(rupees(sample.homeOverview.spent_this_month)).toBe(MONTH_TOTAL);
    expect(rupees(sample.monthSummary.fixed_debit_total ?? "")).toBe(MONTH_RECURRING);
    expect(rupees(sample.budget.budget?.monthly_budget ?? "")).toBe(MONTH_BUDGET);
    expect(rupees(sample.monthSummary.debit_total) / MONTH_BUDGET).toBeCloseTo(0.62, 2);
  });

  it("splits the spending as the reel's donut does", () => {
    expect(spentBy("Food & Dining")).toBe(CATEGORY_SPEND.food);
    expect(spentBy("Shopping")).toBe(CATEGORY_SPEND.shopping);
    expect(spentBy("Transport")).toBe(CATEGORY_SPEND.transport);
    const other = MONTH_TOTAL - spentBy("Food & Dining") - spentBy("Shopping") - spentBy("Transport");
    expect(other).toBe(CATEGORY_SPEND.other);
  });

  it("has the reel's five payees, with their amounts, as the newest rows", () => {
    const newest = items.filter((tx) => tx.type === "debit").slice(0, 5);
    expect(newest.map((tx) => tx.merchant)).toEqual(["Chai", "Smoor", "Zepto", "Rapido", "Swiggy"]);
    const reel = [REEL_PAYEES.chai, REEL_PAYEES.smoor, REEL_PAYEES.zepto, REEL_PAYEES.rapido, REEL_PAYEES.swiggy];
    expect(newest.map((tx) => rupees(tx.amount))).toEqual(reel.map((payee) => payee.amount));
  });
});

describe("buildSampleSet (this month and last)", () => {
  const today = new Date(2026, 9, 15);
  const set = buildSampleSet({ today, timezone: TZ });

  it("covers the current month and the month before it", () => {
    expect(isSampleMonth(set.current, 2026, 9)).toBe(true);
    expect(isSampleMonth(set.previous, 2026, 8)).toBe(true);
    expect(pickSampleMonth(set, 2026, 9)).toEqual({ month: set.current, past: false });
    expect(pickSampleMonth(set, 2026, 8)).toEqual({ month: set.previous, past: true });
    expect(pickSampleMonth(set, 2026, 7)).toBeUndefined();
    expect(pickSampleMonth(set, 2025, 9)).toBeUndefined();
  });

  it("has last month's everyday spending a little higher, with the same recurring bills", () => {
    const current = set.current.monthSummary;
    const previous = set.previous.monthSummary;
    expect(cents(previous.flexible_debit_total ?? "")).toBeGreaterThan(
      cents(current.flexible_debit_total ?? ""),
    );
    expect(cents(previous.fixed_debit_total ?? "")).toBe(cents(current.fixed_debit_total ?? ""));
  });

  it("never shares a row id between the two months", () => {
    const ids = (month: typeof set.current) => month.monthPages.pages[0].items.map((tx) => tx.id);
    expect(ids(set.current).filter((id) => ids(set.previous).includes(id))).toEqual([]);
    expect(ids(set.previous).every((id) => isTourSampleId(id))).toBe(true);
  });

  it("dates last month's rows inside last month", () => {
    for (const tx of set.previous.monthPages.pages[0].items) {
      expect(dayOf(tx.transaction_at).startsWith("2026-09")).toBe(true);
    }
  });
});
