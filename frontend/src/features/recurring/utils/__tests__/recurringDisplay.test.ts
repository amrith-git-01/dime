import type { RecurringItem } from "../../types";
import {
  formatDueDate,
  formatMonthlyEquivalent,
  formatRecurringSubtitle,
  parseDueDate,
  postCurrentPeriodLabel,
  selectUpcoming,
} from "../recurringDisplay";

const TODAY = new Date(2026, 9, 15); // 15 Oct 2026

function item(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: "r1",
    kind: "subscription",
    name: "Netflix",
    amount: "649.00",
    category_id: null,
    category: null,
    category_icon_name: null,
    category_color: null,
    cadence: "monthly",
    day_of_month: 20,
    month_of_year: null,
    timezone: "Asia/Kolkata",
    next_due_date: "2026-10-20",
    active: true,
    note: null,
    monthly_equivalent: "649.00",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseDueDate", () => {
  it("reads a YYYY-MM-DD as a local calendar date", () => {
    const d = parseDueDate("2026-10-20");
    expect([d?.getFullYear(), d?.getMonth(), d?.getDate()]).toEqual([
      2026, 9, 20,
    ]);
  });

  it("returns null for malformed input", () => {
    expect(parseDueDate("20/10/2026")).toBeNull();
    expect(parseDueDate("")).toBeNull();
  });
});

describe("formatDueDate", () => {
  it.each([
    ["2026-10-15", "Due today"],
    ["2026-10-16", "Due tomorrow"],
    ["2026-10-18", "Due in 3 days"],
    ["2026-10-22", "Due in 7 days"],
    ["2026-10-23", "Due 23 Oct"],
    ["2026-12-01", "Due 1 Dec"],
    ["2027-01-05", "Due 5 Jan 2027"],
  ])("%s -> %s", (iso, expected) => {
    expect(formatDueDate(iso, TODAY)).toBe(expected);
  });

  it("is empty for a malformed date", () => {
    expect(formatDueDate("soon", TODAY)).toBe("");
  });
});

describe("formatRecurringSubtitle", () => {
  it("joins cadence and due date", () => {
    expect(formatRecurringSubtitle(item(), TODAY)).toBe(
      "Monthly · Due in 5 days",
    );
  });

  it("shows Paused instead of a due date for inactive items", () => {
    expect(formatRecurringSubtitle(item({ active: false }), TODAY)).toBe(
      "Monthly · Paused",
    );
  });
});

describe("formatMonthlyEquivalent", () => {
  it("is null for monthly items", () => {
    expect(formatMonthlyEquivalent(item())).toBeNull();
  });

  it("shows the monthly equivalent for yearly items", () => {
    const text = formatMonthlyEquivalent(
      item({ cadence: "yearly", monthly_equivalent: "100.00" }),
    );
    expect(text).toContain("100.00");
    expect(text).toContain("/mo");
  });
});

describe("selectUpcoming", () => {
  it("keeps active items due within 30 days, soonest first", () => {
    const items = [
      item({ id: "late", next_due_date: "2026-11-14" }),
      item({ id: "soon", next_due_date: "2026-10-16" }),
      item({ id: "far", next_due_date: "2026-11-15" }),
      item({ id: "past", next_due_date: "2026-10-14" }),
      item({ id: "paused", next_due_date: "2026-10-17", active: false }),
      item({ id: "today", next_due_date: "2026-10-15" }),
    ];
    expect(selectUpcoming(items, TODAY).map((i) => i.id)).toEqual([
      "today",
      "soon",
      "late",
    ]);
  });

  it("puts income before bills on the same day and caps the list", () => {
    const items = [
      item({ id: "bill", next_due_date: "2026-10-20" }),
      item({ id: "pay", kind: "income", next_due_date: "2026-10-20" }),
      item({ id: "a", next_due_date: "2026-10-21" }),
      item({ id: "b", next_due_date: "2026-10-22" }),
      item({ id: "c", next_due_date: "2026-10-23" }),
    ];
    expect(selectUpcoming(items, TODAY).map((i) => i.id)).toEqual([
      "pay",
      "bill",
      "a",
      "b",
    ]);
  });
});

describe("postCurrentPeriodLabel", () => {
  it("words the switch by kind and cadence", () => {
    expect(postCurrentPeriodLabel("income", "monthly")).toBe(
      "Already received this month? Add it now",
    );
    expect(postCurrentPeriodLabel("subscription", "yearly")).toBe(
      "Already paid this year? Add it now",
    );
  });
});
