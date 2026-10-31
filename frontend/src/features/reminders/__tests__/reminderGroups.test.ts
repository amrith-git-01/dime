import type { RecurringItem } from "@/features/recurring/types";

import type { Reminder } from "../types";
import { groupOpenReminders, sortDoneReminders } from "../utils/reminderGroups";
import { selectUpcomingEntries } from "../utils/upcomingMerge";

const TODAY = new Date(2026, 9, 31, 10, 0);

function reminder(id: string, due: string, over: Partial<Reminder> = {}): Reminder {
  return {
    id,
    direction: "pay",
    title: `Item ${id}`,
    amount: null,
    counterparty_name: null,
    upi_id: null,
    due_date: due,
    cadence: "none",
    lead_days: null,
    effective_lead_days: [],
    remind_time: null,
    timezone: "Asia/Kolkata",
    status: "open",
    completed_at: null,
    next_fire_at: null,
    suggested_match: null,
    ...over,
  };
}

function recurring(
  id: string,
  due: string,
  kind: RecurringItem["kind"] = "subscription",
  active = true,
): RecurringItem {
  return {
    id,
    kind,
    name: `Rec ${id}`,
    amount: "100.00",
    category_id: null,
    category: null,
    category_icon_name: null,
    category_color: null,
    cadence: "monthly",
    day_of_month: 1,
    month_of_year: null,
    timezone: "Asia/Kolkata",
    next_due_date: due,
    active,
    note: null,
    monthly_equivalent: "100.00",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("groupOpenReminders", () => {
  it("splits into Overdue, Due soon and Later, oldest first, and leaves empty sections out", () => {
    const sections = groupOpenReminders(
      [
        reminder("later", "2026-12-01"),
        reminder("soon-b", "2026-11-05"),
        reminder("overdue-b", "2026-10-30"),
        reminder("today", "2026-10-31"),
        reminder("overdue-a", "2026-10-20"),
        reminder("edge-7", "2026-11-07"),
        reminder("edge-8", "2026-11-08"),
      ],
      TODAY,
    );
    expect(sections.map((s) => s.title)).toEqual(["Overdue", "Due soon", "Later"]);
    expect(sections[0]!.items.map((r) => r.id)).toEqual(["overdue-a", "overdue-b"]);
    expect(sections[1]!.items.map((r) => r.id)).toEqual(["today", "soon-b", "edge-7"]);
    expect(sections[2]!.items.map((r) => r.id)).toEqual(["edge-8", "later"]);
    expect(
      groupOpenReminders([reminder("a", "2026-11-02")], TODAY).map((s) => s.id),
    ).toEqual(["dueSoon"]);
    expect(groupOpenReminders([], TODAY)).toEqual([]);
  });

  it("breaks date ties by title and never lists closed reminders", () => {
    const sections = groupOpenReminders(
      [
        reminder("b", "2026-11-02", { title: "Zed" }),
        reminder("a", "2026-11-02", { title: "Abe" }),
        reminder("c", "2026-11-02", { status: "done" }),
      ],
      TODAY,
    );
    expect(sections[0]!.items.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("sortDoneReminders", () => {
  it("puts the most recently closed first and drops open ones", () => {
    const sorted = sortDoneReminders([
      reminder("old", "2026-09-01", { status: "done", completed_at: "2026-09-02T00:00:00Z" }),
      reminder("open", "2026-11-01"),
      reminder("new", "2026-10-01", { status: "dismissed", completed_at: "2026-10-02T00:00:00Z" }),
      reminder("never", "2026-08-01", { status: "done" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["new", "old", "never"]);
  });
});

describe("selectUpcomingEntries (the Upcoming card on Home)", () => {
  it("merges recurring items and reminders in one date-sorted list", () => {
    const entries = selectUpcomingEntries({
      recurring: [recurring("r1", "2026-11-10"), recurring("r2", "2026-11-03", "income")],
      reminders: [reminder("a", "2026-11-05"), reminder("b", "2026-11-01")],
      today: TODAY,
    });
    expect(entries.map((e) => e.id)).toEqual([
      "reminder:b",
      "recurring:r2",
      "reminder:a",
      "recurring:r1",
    ]);
  });

  it("puts overdue reminders first and leaves out overdue recurring items", () => {
    const entries = selectUpcomingEntries({
      recurring: [recurring("r1", "2026-10-29"), recurring("r2", "2026-11-02")],
      reminders: [reminder("late", "2026-10-25")],
      today: TODAY,
    });
    expect(entries.map((e) => e.id)).toEqual(["reminder:late", "recurring:r2"]);
  });

  it("shows at most two overdue reminders (the oldest) so the next salary or bill stays on the card", () => {
    const entries = selectUpcomingEntries({
      recurring: [recurring("salary", "2026-11-01", "income"), recurring("bill", "2026-11-03")],
      reminders: [
        reminder("o3", "2026-10-28"),
        reminder("o1", "2026-10-01"),
        reminder("o4", "2026-10-30"),
        reminder("o2", "2026-10-10"),
        reminder("o5", "2026-10-29"),
      ],
      today: TODAY,
    });
    expect(entries.map((e) => e.id)).toEqual([
      "reminder:o1",
      "reminder:o2",
      "recurring:salary",
      "recurring:bill",
    ]);
  });

  it("the cap does not hold back reminders that are not overdue", () => {
    const entries = selectUpcomingEntries({
      recurring: [],
      reminders: [
        reminder("o1", "2026-10-01"),
        reminder("o2", "2026-10-02"),
        reminder("o3", "2026-10-03"),
        reminder("today", "2026-10-31"),
        reminder("soon", "2026-11-02"),
      ],
      today: TODAY,
    });
    expect(entries.map((e) => e.id)).toEqual([
      "reminder:o1",
      "reminder:o2",
      "reminder:today",
      "reminder:soon",
    ]);
  });

  it("on the same day: a reminder, then salary, then bills", () => {
    const entries = selectUpcomingEntries({
      recurring: [
        recurring("bill", "2026-11-02", "subscription"),
        recurring("pay", "2026-11-02", "income"),
      ],
      reminders: [reminder("rem", "2026-11-02")],
      today: TODAY,
    });
    expect(entries.map((e) => e.id)).toEqual(["reminder:rem", "recurring:pay", "recurring:bill"]);
  });

  it("caps like the card always did and honours the 30 day window", () => {
    const many = Array.from({ length: 6 }, (_, i) => reminder(`m${i}`, `2026-11-0${i + 1}`));
    expect(selectUpcomingEntries({ recurring: [], reminders: many, today: TODAY })).toHaveLength(4);
    const far = selectUpcomingEntries({
      recurring: [recurring("r", "2026-12-15")],
      reminders: [reminder("f", "2026-12-15")],
      today: TODAY,
    });
    expect(far).toEqual([]);
  });

  it("shows reminders even when there are no recurring items, and skips closed or paused ones", () => {
    const entries = selectUpcomingEntries({
      recurring: [recurring("paused", "2026-11-02", "subscription", false)],
      reminders: [reminder("a", "2026-11-02"), reminder("done", "2026-11-02", { status: "done" })],
      today: TODAY,
    });
    expect(entries.map((e) => e.id)).toEqual(["reminder:a"]);
  });

  it("keeps ids unique when a recurring item and a reminder share an id", () => {
    const entries = selectUpcomingEntries({
      recurring: [recurring("same", "2026-11-02")],
      reminders: [reminder("same", "2026-11-02")],
      today: TODAY,
    });
    expect(new Set(entries.map((e) => e.id)).size).toBe(2);
  });
});
