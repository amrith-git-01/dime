import { leadDayCap } from "../constants";
import type { Reminder, ReminderFormState } from "../types";
import {
  buildCreateBody,
  buildUpdateBody,
  clampLeadDays,
  collectFieldErrors,
  effectiveLeadDays,
  emptyReminderForm,
  formFromReminder,
  hasChanges,
  parseUpiId,
  toggleLeadDay,
  validateReminderForm,
  visibleFieldErrors,
} from "../utils/reminderForm";

const TODAY = new Date(2026, 9, 31, 10, 0);
const CTX = { today: TODAY };
const TZ = "Asia/Kolkata";

function form(over: Partial<ReminderFormState> = {}): ReminderFormState {
  return { ...emptyReminderForm(TODAY), title: "Rent", ...over };
}

function saved(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    direction: "pay",
    title: "Rent",
    amount: "15000.00",
    counterparty_name: "Landlord",
    upi_id: "landlord@okbank",
    due_date: "2026-11-05",
    cadence: "monthly",
    lead_days: [3, 1],
    effective_lead_days: [3, 1],
    remind_time: "09:30",
    timezone: TZ,
    status: "open",
    completed_at: null,
    next_fire_at: null,
    suggested_match: null,
    ...over,
  };
}

describe("emptyReminderForm / formFromReminder", () => {
  it("starts as a payment due today with the user's defaults", () => {
    expect(emptyReminderForm(TODAY)).toEqual({
      direction: "pay",
      amountText: "",
      title: "",
      name: "",
      upiId: "",
      dueDate: "2026-10-31",
      cadence: "none",
      leadDays: null,
      remindTime: null,
    });
  });

  it("reads a saved reminder back into the form", () => {
    expect(formFromReminder(saved({ amount: null, counterparty_name: null, upi_id: null, lead_days: null, remind_time: null }))).toEqual({
      direction: "pay",
      amountText: "",
      title: "Rent",
      name: "",
      upiId: "",
      dueDate: "2026-11-05",
      cadence: "monthly",
      leadDays: null,
      remindTime: null,
    });
    expect(formFromReminder(saved()).amountText).toBe("15000.00");
  });
});

describe("lead day helpers", () => {
  it("caps by repeat", () => {
    expect(leadDayCap("none")).toBe(30);
    expect(leadDayCap("weekly")).toBe(6);
    expect(leadDayCap("monthly")).toBe(27);
    expect(leadDayCap("yearly")).toBe(27);
  });

  it("drops lead days above the repeat's cap", () => {
    expect(clampLeadDays([7, 3, 0], "weekly")).toEqual([3, 0]);
    expect(clampLeadDays([7, 3, 0], "monthly")).toEqual([7, 3, 0]);
  });

  it("toggles one day, largest first, never above the cap or beyond five", () => {
    expect(toggleLeadDay([3, 1], 7, "none")).toEqual([7, 3, 1]);
    expect(toggleLeadDay([7, 3, 1], 3, "none")).toEqual([7, 1]);
    expect(toggleLeadDay([3], 7, "weekly")).toEqual([3]);
    expect(toggleLeadDay([7, 5, 3, 2, 1], 0, "none")).toEqual([7, 5, 3, 2, 1]);
    // Removing is always allowed, even when full.
    expect(toggleLeadDay([7, 5, 3, 2, 1], 5, "none")).toEqual([7, 3, 2, 1]);
  });

  it("shows the user's default (within the cap) until the reminder has its own", () => {
    expect(effectiveLeadDays({ leadDays: null, cadence: "none" }, [3, 1, 0])).toEqual([3, 1, 0]);
    expect(effectiveLeadDays({ leadDays: null, cadence: "weekly" }, [7, 3])).toEqual([3]);
    expect(effectiveLeadDays({ leadDays: [2], cadence: "none" }, [3, 1, 0])).toEqual([2]);
    expect(effectiveLeadDays({ leadDays: [], cadence: "none" }, [3, 1, 0])).toEqual([]);
  });
});

describe("parseUpiId", () => {
  it("accepts name@bank and trims", () => {
    expect(parseUpiId(" ravi.k-1@okhdfc ")).toBe("ravi.k-1@okhdfc");
  });
  it("rejects anything else", () => {
    for (const bad of ["", "ravi", "ravi@", "@bank", "r@b", "ra vi@bank", "ravi@bank@x"]) {
      expect(parseUpiId(bad)).toBeNull();
    }
  });
});

describe("validation", () => {
  it("accepts the smallest valid form", () => {
    expect(validateReminderForm(form(), CTX)).toEqual({ ok: true });
  });

  it("needs a title of at most 80 characters", () => {
    expect(collectFieldErrors(form({ title: "  " }), CTX).title).toBe("Enter a title.");
    expect(collectFieldErrors(form({ title: "x".repeat(81) }), CTX).title).toMatch(/at most 80/);
    expect(collectFieldErrors(form({ title: "x".repeat(80) }), CTX).title).toBeUndefined();
  });

  it("makes the amount optional but strict when typed", () => {
    expect(collectFieldErrors(form({ amountText: "" }), CTX).amount).toBeUndefined();
    expect(collectFieldErrors(form({ amountText: "1,500.50" }), CTX).amount).toBeUndefined();
    expect(collectFieldErrors(form({ amountText: "0" }), CTX).amount).toMatch(/greater than zero/);
    expect(collectFieldErrors(form({ amountText: "abc" }), CTX).amount).toMatch(/greater than zero/);
    expect(collectFieldErrors(form({ amountText: "1.234" }), CTX).amount).toMatch(/greater than zero/);
    expect(collectFieldErrors(form({ amountText: "12345678901" }), CTX).amount).toMatch(/10 digits/);
  });

  it("checks the UPI id only for a payment", () => {
    expect(collectFieldErrors(form({ upiId: "nope" }), CTX).upi).toBe("Enter a UPI ID like name@bank.");
    expect(collectFieldErrors(form({ upiId: "ok@bank" }), CTX).upi).toBeUndefined();
    expect(collectFieldErrors(form({ direction: "receive", upiId: "nope" }), CTX).upi).toBeUndefined();
  });

  it("refuses a new reminder more than a day in the past, but not yesterday", () => {
    expect(collectFieldErrors(form({ dueDate: "2026-10-30" }), CTX).date).toBeUndefined();
    expect(collectFieldErrors(form({ dueDate: "2026-10-29" }), CTX).date).toBe("Choose today or a later date.");
    expect(collectFieldErrors(form({ dueDate: "garbage" }), CTX).date).toBe("Choose a due date.");
  });

  it("lets an unmoved overdue date stay while editing", () => {
    const ctx = { today: TODAY, savedDueDate: "2026-10-20" };
    expect(collectFieldErrors(form({ dueDate: "2026-10-20" }), ctx).date).toBeUndefined();
    expect(collectFieldErrors(form({ dueDate: "2026-10-21" }), ctx).date).toBe("Choose today or a later date.");
  });

  it("enforces the lead-day cap of the repeat", () => {
    expect(
      collectFieldErrors(form({ cadence: "weekly", leadDays: [7] }), CTX).leadDays,
    ).toBe("A weekly reminder can start at most 6 days before.");
    expect(
      collectFieldErrors(form({ cadence: "monthly", leadDays: [27, 3] }), CTX).leadDays,
    ).toBeUndefined();
    expect(
      collectFieldErrors(form({ cadence: "monthly", leadDays: [28] }), CTX).leadDays,
    ).toMatch(/at most 27/);
    expect(
      collectFieldErrors(form({ cadence: "none", leadDays: [30] }), CTX).leadDays,
    ).toBeUndefined();
    expect(
      collectFieldErrors(form({ leadDays: [5, 4, 3, 2, 1, 0] }), CTX).leadDays,
    ).toMatch(/at most 5/);
    expect(collectFieldErrors(form({ cadence: "weekly", leadDays: null }), CTX).leadDays).toBeUndefined();
  });

  it("reports the first problem in field order", () => {
    const result = validateReminderForm(form({ title: "", amountText: "x" }), CTX);
    expect(result).toEqual({ ok: false, field: "title", error: "Enter a title." });
  });

  it("keeps an empty title quiet until Save is tried", () => {
    expect(visibleFieldErrors(form({ title: "" }), false, CTX).title).toBeUndefined();
    expect(visibleFieldErrors(form({ title: "" }), true, CTX).title).toBe("Enter a title.");
    expect(visibleFieldErrors(form({ amountText: "x" }), false, CTX).amount).toBeDefined();
  });
});

describe("buildCreateBody", () => {
  it("builds the minimal body", () => {
    expect(buildCreateBody(form(), TZ, CTX)).toEqual({
      direction: "pay",
      title: "Rent",
      due_date: "2026-10-31",
      timezone: TZ,
      cadence: "none",
    });
  });

  it("includes only what was filled in, trimmed", () => {
    expect(
      buildCreateBody(
        form({
          title: "  Rent  ",
          amountText: "15,000.5",
          name: " Landlord ",
          upiId: " landlord@okbank ",
          dueDate: "2026-11-05",
          cadence: "monthly",
          leadDays: [3, 1],
          remindTime: "08:30",
        }),
        TZ,
        CTX,
      ),
    ).toEqual({
      direction: "pay",
      title: "Rent",
      amount: "15000.50",
      counterparty_name: "Landlord",
      upi_id: "landlord@okbank",
      due_date: "2026-11-05",
      cadence: "monthly",
      lead_days: [3, 1],
      remind_time: "08:30",
      timezone: TZ,
    });
  });

  it("omits lead days and time when they follow the user's default, and sends an explicit none", () => {
    const body = buildCreateBody(form({ leadDays: null, remindTime: null }), TZ, CTX)!;
    expect("lead_days" in body).toBe(false);
    expect("remind_time" in body).toBe(false);
    expect(buildCreateBody(form({ leadDays: [] }), TZ, CTX)!.lead_days).toEqual([]);
  });

  it("never sends a UPI id for a receivable", () => {
    const body = buildCreateBody(form({ direction: "receive", upiId: "x@bank" }), TZ, CTX)!;
    expect(body.direction).toBe("receive");
    expect("upi_id" in body).toBe(false);
  });

  it("returns null for an invalid form", () => {
    expect(buildCreateBody(form({ title: "" }), TZ, CTX)).toBeNull();
    expect(buildCreateBody(form({ dueDate: "2026-10-01" }), TZ, CTX)).toBeNull();
  });
});

describe("buildUpdateBody", () => {
  const same = () => formFromReminder(saved());

  it("is empty when nothing changed", () => {
    const body = buildUpdateBody(saved(), same(), TZ, TODAY)!;
    expect(body).toEqual({});
    expect(hasChanges(body)).toBe(false);
  });

  it("sends only what changed, with the timezone when the schedule moved", () => {
    expect(buildUpdateBody(saved(), { ...same(), title: "House rent" }, TZ, TODAY)).toEqual({
      title: "House rent",
    });
    expect(buildUpdateBody(saved(), { ...same(), dueDate: "2026-11-10" }, TZ, TODAY)).toEqual({
      due_date: "2026-11-10",
      timezone: TZ,
    });
    expect(buildUpdateBody(saved(), { ...same(), cadence: "yearly" }, TZ, TODAY)).toEqual({
      cadence: "yearly",
      timezone: TZ,
    });
    expect(buildUpdateBody(saved(), { ...same(), amountText: "16000" }, TZ, TODAY)).toEqual({
      amount: "16000.00",
    });
  });

  it("clears optional fields with null", () => {
    const body = buildUpdateBody(
      saved(),
      { ...same(), amountText: "", name: "", upiId: "", leadDays: null, remindTime: null },
      TZ,
      TODAY,
    );
    expect(body).toEqual({
      amount: null,
      counterparty_name: null,
      upi_id: null,
      lead_days: null,
      remind_time: null,
      timezone: TZ,
    });
  });

  it("does not see a reordered lead-day list as a change", () => {
    expect(buildUpdateBody(saved(), { ...same(), leadDays: [1, 3] }, TZ, TODAY)).toEqual({});
  });

  it("drops the payee UPI id when a payment becomes a receivable", () => {
    expect(buildUpdateBody(saved(), { ...same(), direction: "receive" }, TZ, TODAY)).toEqual({
      direction: "receive",
      upi_id: null,
    });
  });

  it("keeps an overdue date that was not touched", () => {
    const overdue = saved({ due_date: "2026-10-01" });
    expect(buildUpdateBody(overdue, { ...formFromReminder(overdue), title: "Rent!" }, TZ, TODAY)).toEqual({
      title: "Rent!",
    });
  });

  it("returns null for an invalid form", () => {
    expect(buildUpdateBody(saved(), { ...same(), title: "" }, TZ, TODAY)).toBeNull();
    expect(
      buildUpdateBody(saved({ cadence: "weekly", lead_days: null }), { ...same(), cadence: "weekly", leadDays: [7] }, TZ, TODAY),
    ).toBeNull();
  });
});
