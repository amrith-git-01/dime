import type { Reminder } from "../types";
import {
  daysUntilDue,
  dueLabel,
  formatCadenceLabel,
  formatDueIn,
  formatLongDate,
  fromDayString,
  reminderSubtitle,
  toDayString,
} from "../utils/reminderDates";
import {
  counterpartyPhrase,
  formatClosedLine,
  markDoneLabel,
  reminderAccessibilityLabel,
} from "../utils/reminderLabels";

// 31 Oct 2026, one minute to midnight local time: a UTC-based calculation would already say 1 Nov.
const LATE = new Date(2026, 9, 31, 23, 59);
const EARLY = new Date(2026, 9, 31, 0, 1);

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    direction: "pay",
    title: "Rent",
    amount: "15000.00",
    counterparty_name: "Landlord",
    upi_id: null,
    due_date: "2026-11-05",
    cadence: "none",
    lead_days: null,
    effective_lead_days: [3, 1, 0],
    remind_time: null,
    timezone: "Asia/Kolkata",
    status: "open",
    completed_at: null,
    next_fire_at: null,
    suggested_match: null,
    ...over,
  };
}

describe("daysUntilDue (local calendar days)", () => {
  it("counts whole calendar days whatever the time of day", () => {
    expect(daysUntilDue("2026-10-31", LATE)).toBe(0);
    expect(daysUntilDue("2026-10-31", EARLY)).toBe(0);
    expect(daysUntilDue("2026-11-01", LATE)).toBe(1);
    expect(daysUntilDue("2026-11-01", EARLY)).toBe(1);
    expect(daysUntilDue("2026-10-30", LATE)).toBe(-1);
    expect(daysUntilDue("2026-11-30", LATE)).toBe(30);
  });

  it("crosses a month and a year end", () => {
    expect(daysUntilDue("2027-01-01", new Date(2026, 11, 30, 12))).toBe(2);
    expect(daysUntilDue("2026-12-31", new Date(2027, 0, 2, 12))).toBe(-2);
  });

  it("is null for a malformed date", () => {
    expect(daysUntilDue("tomorrow", LATE)).toBeNull();
    expect(daysUntilDue("2026-02-31", LATE)).toBeNull();
  });
});

describe("day strings", () => {
  it("round-trip a local day without a UTC shift", () => {
    expect(toDayString(new Date(2026, 9, 31, 23, 59))).toBe("2026-10-31");
    expect(toDayString(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
    expect(toDayString(fromDayString("2026-03-08"))).toBe("2026-03-08");
  });
});

describe("formatDueIn / dueLabel", () => {
  it("says it in words", () => {
    expect(formatDueIn(0, "2026-10-31", LATE)).toBe("Due today");
    expect(formatDueIn(1, "2026-11-01", LATE)).toBe("Due tomorrow");
    expect(formatDueIn(3, "2026-11-03", LATE)).toBe("Due in 3 days");
    expect(formatDueIn(-1, "2026-10-30", LATE)).toBe("1 day overdue");
    expect(formatDueIn(-2, "2026-10-29", LATE)).toBe("2 days overdue");
  });

  it("switches to a date beyond a month", () => {
    expect(formatDueIn(45, "2026-12-15", LATE)).toBe("Due 15 Dec");
    expect(formatDueIn(120, "2027-02-28", LATE)).toBe("Due 28 Feb 2027");
  });

  it("tags the tone", () => {
    expect(dueLabel("2026-10-29", LATE)).toEqual({ text: "2 days overdue", tone: "overdue" });
    expect(dueLabel("2026-10-31", LATE)).toEqual({ text: "Due today", tone: "today" });
    expect(dueLabel("2026-11-07", LATE)).toEqual({ text: "Due in 7 days", tone: "soon" });
    expect(dueLabel("2026-11-08", LATE)).toEqual({ text: "Due in 8 days", tone: "later" });
    expect(dueLabel("garbage", LATE)).toEqual({ text: "", tone: "later" });
  });
});

describe("labels", () => {
  it("names the cadences", () => {
    expect(formatCadenceLabel("none")).toBe("Once");
    expect(formatCadenceLabel("weekly")).toBe("Weekly");
    expect(formatCadenceLabel("monthly")).toBe("Monthly");
    expect(formatCadenceLabel("yearly")).toBe("Yearly");
  });

  it("formats a long date for screen readers", () => {
    expect(formatLongDate("2026-11-15")).toBe("Sunday 15 November 2026");
    expect(formatLongDate("nope")).toBe("");
  });

  it("builds the subtitle from name and timing", () => {
    expect(reminderSubtitle(reminder({ due_date: "2026-11-03" }), LATE)).toBe(
      "Landlord · Due in 3 days",
    );
    expect(
      reminderSubtitle(reminder({ counterparty_name: null, due_date: "2026-10-29" }), LATE),
    ).toBe("2 days overdue");
  });

  it("uses the right verb and phrase for each direction", () => {
    expect(markDoneLabel({ direction: "pay" })).toBe("Mark paid");
    expect(markDoneLabel({ direction: "receive" })).toBe("Mark received");
    expect(counterpartyPhrase({ direction: "pay", counterparty_name: "Landlord" })).toBe("to Landlord");
    expect(counterpartyPhrase({ direction: "receive", counterparty_name: " Ravi " })).toBe("from Ravi");
    expect(counterpartyPhrase({ direction: "pay", counterparty_name: null })).toBe("");
  });

  it("describes a finished reminder", () => {
    expect(
      formatClosedLine({ status: "done", direction: "pay", completed_at: "2026-11-03T08:00:00.000Z" }),
    ).toMatch(/^Paid \d{1,2} Nov$/);
    expect(formatClosedLine({ status: "done", direction: "receive", completed_at: null })).toBe(
      "Received",
    );
    expect(formatClosedLine({ status: "done", direction: "pay", completed_at: "not a date" })).toBe(
      "Paid",
    );
    expect(formatClosedLine({ status: "dismissed", direction: "pay", completed_at: null })).toBe(
      "Dismissed",
    );
  });

  it("reads a whole row for a screen reader with the full amount and date", () => {
    const label = reminderAccessibilityLabel(
      reminder({ due_date: "2026-11-05", cadence: "monthly" }),
      LATE,
    );
    expect(label).toContain("Rent");
    expect(label).toContain("to pay");
    expect(label).toContain("15,000.00");
    expect(label).toContain("to Landlord");
    expect(label).toContain("Due in 5 days, Thursday 5 November 2026");
    expect(label).toContain("repeats monthly");
  });

  it("reads a receivable without an amount or name", () => {
    const label = reminderAccessibilityLabel(
      reminder({
        direction: "receive",
        amount: null,
        counterparty_name: null,
        due_date: "2026-10-30",
      }),
      LATE,
    );
    expect(label).toBe("Rent, to receive, 1 day overdue, Friday 30 October 2026");
  });
});
