import type { RecurringFormState, RecurringItem } from "../../types";
import {
  buildCreateBody,
  buildUpdateBody,
  collectFieldErrors,
  defaultPostCurrentPeriod,
  effectiveDayInMonth,
  emptyRecurringForm,
  formFromItem,
  hasChanges,
  isCurrentPeriodDuePassed,
  parseDayOfMonth,
  sanitizeRemindLeadDays,
  toggleRemindLeadDay,
  validateRecurringForm,
  visibleFieldErrors,
} from "../recurringForm";

const TZ = "Asia/Kolkata";
const TODAY = new Date(2026, 9, 15); // 15 Oct 2026

function form(overrides: Partial<RecurringFormState> = {}): RecurringFormState {
  return {
    ...emptyRecurringForm("income", TODAY, "cat-income"),
    name: "Salary",
    amountText: "50000",
    dayOfMonthText: "1",
    ...overrides,
  };
}

function item(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: "r1",
    kind: "subscription",
    name: "Netflix",
    amount: "649.00",
    category_id: "cat-ent",
    category: "Entertainment",
    category_icon_name: "Clapperboard",
    category_color: "#FF0000",
    cadence: "monthly",
    day_of_month: 5,
    month_of_year: null,
    timezone: TZ,
    next_due_date: "2026-11-05",
    active: true,
    note: null,
    monthly_equivalent: "649.00",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

describe("defaultPostCurrentPeriod", () => {
  it("is on for income and off for subscriptions", () => {
    expect(defaultPostCurrentPeriod("income")).toBe(true);
    expect(defaultPostCurrentPeriod("subscription")).toBe(false);
  });

  it("seeds the new form by kind", () => {
    expect(emptyRecurringForm("income", TODAY).postCurrentPeriod).toBe(true);
    expect(emptyRecurringForm("subscription", TODAY).postCurrentPeriod).toBe(
      false,
    );
  });

  it("defaults income to the Salary category and subscriptions to no category", () => {
    expect(emptyRecurringForm("income", TODAY, "cat-income").categoryId).toBe(
      "cat-income",
    );
    expect(
      emptyRecurringForm("subscription", TODAY, "cat-income").categoryId,
    ).toBeNull();
  });
});

describe("parseDayOfMonth", () => {
  it.each([
    ["1", 1],
    ["31", 31],
    [" 15 ", 15],
  ])("accepts %j", (text, expected) => {
    expect(parseDayOfMonth(text)).toBe(expected);
  });

  it.each(["", "0", "32", "1.5", "-3", "abc", "100"])("rejects %j", (text) => {
    expect(parseDayOfMonth(text)).toBeNull();
  });
});

describe("effectiveDayInMonth", () => {
  it("clamps to the last day of short months", () => {
    expect(effectiveDayInMonth(31, 2026, 1)).toBe(28); // Feb 2026
    expect(effectiveDayInMonth(31, 2028, 1)).toBe(29); // leap year
    expect(effectiveDayInMonth(31, 2026, 3)).toBe(30); // April
    expect(effectiveDayInMonth(15, 2026, 1)).toBe(15);
  });
});

describe("isCurrentPeriodDuePassed", () => {
  const monthly = (dayOfMonth: number) => ({
    cadence: "monthly" as const,
    dayOfMonth,
    monthOfYear: 1,
  });

  it("is true when this month's day is before today", () => {
    expect(isCurrentPeriodDuePassed(monthly(1), TODAY)).toBe(true);
    expect(isCurrentPeriodDuePassed(monthly(14), TODAY)).toBe(true);
  });

  it("is false for today and for days still ahead", () => {
    expect(isCurrentPeriodDuePassed(monthly(15), TODAY)).toBe(false);
    expect(isCurrentPeriodDuePassed(monthly(28), TODAY)).toBe(false);
  });

  it("uses the last day for short months", () => {
    expect(isCurrentPeriodDuePassed(monthly(31), new Date(2026, 1, 28))).toBe(
      false,
    );
    expect(isCurrentPeriodDuePassed(monthly(31), new Date(2026, 3, 30))).toBe(
      false,
    );
    expect(isCurrentPeriodDuePassed(monthly(31), new Date(2026, 3, 29))).toBe(
      false,
    );
  });

  it("compares the whole date for yearly items", () => {
    const yearly = (monthOfYear: number, dayOfMonth: number) => ({
      cadence: "yearly" as const,
      dayOfMonth,
      monthOfYear,
    });
    expect(isCurrentPeriodDuePassed(yearly(3, 20), TODAY)).toBe(true);
    expect(isCurrentPeriodDuePassed(yearly(10, 3), TODAY)).toBe(true);
    expect(isCurrentPeriodDuePassed(yearly(10, 15), TODAY)).toBe(false);
    expect(isCurrentPeriodDuePassed(yearly(12, 1), TODAY)).toBe(false);
  });
});

describe("validateRecurringForm", () => {
  it("accepts a complete form", () => {
    expect(validateRecurringForm(form())).toEqual({
      ok: true,
      paise: 5_000_000,
      dayOfMonth: 1,
      categoryId: "cat-income",
    });
  });

  it("requires a category for both kinds", () => {
    for (const kind of ["income", "subscription"] as const) {
      expect(
        validateRecurringForm({
          ...emptyRecurringForm(kind, TODAY),
          name: "x",
          amountText: "10",
          dayOfMonthText: "1",
        }),
      ).toMatchObject({ ok: false, field: "category" });
    }
  });

  it("requires a name", () => {
    expect(validateRecurringForm(form({ name: "  " }))).toMatchObject({
      ok: false,
      field: "name",
    });
  });

  it.each(["", "0", "abc", "1.234"])("rejects amount %j", (amountText) => {
    expect(validateRecurringForm(form({ amountText }))).toMatchObject({
      ok: false,
      field: "amount",
    });
  });

  it("allows 10 whole digits and rejects 11", () => {
    expect(
      validateRecurringForm(form({ amountText: "9999999999.99" })).ok,
    ).toBe(true);
    expect(
      validateRecurringForm(form({ amountText: "10000000000" })),
    ).toMatchObject({ ok: false, field: "amount" });
  });

  it("validates the day of month", () => {
    expect(validateRecurringForm(form({ dayOfMonthText: "32" }))).toMatchObject(
      { ok: false, field: "day" },
    );
  });

  it("validates the month only for yearly items", () => {
    expect(
      validateRecurringForm(form({ cadence: "monthly", monthOfYear: 0 })).ok,
    ).toBe(true);
    expect(
      validateRecurringForm(form({ cadence: "yearly", monthOfYear: 13 })),
    ).toMatchObject({ ok: false, field: "month" });
  });
});

describe("buildCreateBody", () => {
  it("builds a monthly income body with the device timezone", () => {
    expect(buildCreateBody("income", form(), TZ, TODAY)).toEqual({
      kind: "income",
      name: "Salary",
      amount: "50000.00",
      category_id: "cat-income",
      cadence: "monthly",
      day_of_month: 1,
      timezone: TZ,
      active: true,
      post_current_period: true,
    });
  });

  it("includes the month only for yearly items and trims the note", () => {
    const body = buildCreateBody(
      "subscription",
      form({
        name: "  Domain ",
        amountText: "999.5",
        cadence: "yearly",
        monthOfYear: 12,
        dayOfMonthText: "20",
        categoryId: "cat-fees",
        note: "  renew  ",
        postCurrentPeriod: false,
      }),
      TZ,
      TODAY,
    );
    expect(body).toEqual({
      kind: "subscription",
      name: "Domain",
      amount: "999.50",
      category_id: "cat-fees",
      cadence: "yearly",
      month_of_year: 12,
      day_of_month: 20,
      timezone: TZ,
      note: "renew",
      active: true,
    });
  });

  it("sends post_current_period only when offered and ticked", () => {
    // Day 20 has not passed yet on the 15th: not offered, so never sent.
    expect(
      buildCreateBody("income", form({ dayOfMonthText: "20" }), TZ, TODAY),
    ).not.toHaveProperty("post_current_period");
    // Passed, but the user unticked it.
    expect(
      buildCreateBody(
        "income",
        form({ dayOfMonthText: "1", postCurrentPeriod: false }),
        TZ,
        TODAY,
      ),
    ).not.toHaveProperty("post_current_period");
  });

  it("returns null for an invalid form", () => {
    expect(buildCreateBody("income", form({ name: "" }), TZ, TODAY)).toBeNull();
  });
});

describe("buildUpdateBody", () => {
  it("is empty when nothing changed", () => {
    const body = buildUpdateBody(item(), formFromItem(item()), TZ);
    expect(body).toEqual({});
    expect(hasChanges(body!)).toBe(false);
  });

  it("sends only the changed fields", () => {
    const body = buildUpdateBody(
      item(),
      { ...formFromItem(item()), name: "Netflix 4K", amountText: "799" },
      TZ,
    );
    expect(body).toEqual({ name: "Netflix 4K", amount: "799.00" });
  });

  it("sends schedule fields with the timezone when the day changes", () => {
    const body = buildUpdateBody(
      item(),
      { ...formFromItem(item()), dayOfMonthText: "9" },
      TZ,
    );
    expect(body).toEqual({ day_of_month: 9, timezone: TZ });
  });

  it("sends cadence with the month when switching to yearly", () => {
    const body = buildUpdateBody(
      item(),
      { ...formFromItem(item()), cadence: "yearly", monthOfYear: 4 },
      TZ,
    );
    expect(body).toEqual({
      cadence: "yearly",
      month_of_year: 4,
      timezone: TZ,
    });
  });

  it("sends a changed category, clears the note with null, and pauses", () => {
    const original = item({ note: "family plan" });
    const body = buildUpdateBody(
      original,
      {
        ...formFromItem(original),
        categoryId: "cat-subs",
        note: " ",
        active: false,
      },
      TZ,
    );
    expect(body).toEqual({
      category_id: "cat-subs",
      note: null,
      active: false,
    });
  });

  it("returns null when the category was cleared", () => {
    expect(
      buildUpdateBody(
        item(),
        { ...formFromItem(item()), categoryId: null },
        TZ,
      ),
    ).toBeNull();
  });

  it("returns null for an invalid form", () => {
    expect(
      buildUpdateBody(item(), { ...formFromItem(item()), amountText: "" }, TZ),
    ).toBeNull();
  });
});

describe("collectFieldErrors", () => {
  it("is empty for a valid form", () => {
    expect(collectFieldErrors(form())).toEqual({});
  });

  it("reports every broken field at once", () => {
    const errors = collectFieldErrors(
      form({ name: "", amountText: "0", dayOfMonthText: "40" }),
    );
    expect(Object.keys(errors).sort()).toEqual(["amount", "day", "name"]);
  });

  it("only checks the month for yearly items", () => {
    expect(collectFieldErrors(form({ monthOfYear: 0 }))).toEqual({});
    expect(
      collectFieldErrors(form({ cadence: "yearly", monthOfYear: 0 })).month,
    ).toBeDefined();
  });
});

describe("visibleFieldErrors", () => {
  const blank = form({ name: "", amountText: "", dayOfMonthText: "" });

  it("keeps untouched empty fields quiet before the first save attempt", () => {
    expect(visibleFieldErrors(blank, false)).toEqual({});
  });

  it("shows empty-field errors once the user tried to save", () => {
    expect(Object.keys(visibleFieldErrors(blank, true)).sort()).toEqual([
      "amount",
      "day",
      "name",
    ]);
  });

  it("asks for a missing category only after a save attempt", () => {
    const noCategory = form({ categoryId: null });
    expect(visibleFieldErrors(noCategory, false)).toEqual({});
    expect(visibleFieldErrors(noCategory, true)).toEqual({
      category: "Choose a category.",
    });
  });

  it("speaks up about a field that has something wrong in it", () => {
    const errors = visibleFieldErrors(form({ dayOfMonthText: "32" }), false);
    expect(errors.day).toBe("Day of month must be between 1 and 31.");
    expect(errors.name).toBeUndefined();
  });
});

describe("create payload per kind (sheet type toggle)", () => {
  it("builds an income body with the income category and the post flag", () => {
    const body = buildCreateBody(
      "income",
      form({ dayOfMonthText: "1", postCurrentPeriod: true }),
      TZ,
      TODAY,
    );
    expect(body).toMatchObject({
      kind: "income",
      category_id: "cat-income",
      post_current_period: true,
    });
  });

  it("builds a subscription body without the post flag when it is off", () => {
    const body = buildCreateBody(
      "subscription",
      form({
        ...emptyRecurringForm("subscription", TODAY),
        name: "Netflix",
        amountText: "649",
        dayOfMonthText: "1",
        categoryId: "cat-ent",
      }),
      TZ,
      TODAY,
    );
    expect(body).toMatchObject({
      kind: "subscription",
      name: "Netflix",
      amount: "649.00",
      category_id: "cat-ent",
    });
    expect(body).not.toHaveProperty("post_current_period");
  });

  it("returns null while the form is invalid", () => {
    expect(
      buildCreateBody("income", form({ name: " " }), TZ, TODAY),
    ).toBeNull();
  });
});

describe("reminder days (remind_lead_days)", () => {
  it("starts with no reminder, and reads an item without the field (older server) as off", () => {
    expect(emptyRecurringForm("subscription", TODAY).remindLeadDays).toEqual([]);
    expect(formFromItem(item()).remindLeadDays).toEqual([]);
    expect(formFromItem(item({ remind_lead_days: null })).remindLeadDays).toEqual([]);
    expect(formFromItem(item({ remind_lead_days: [1, 3] })).remindLeadDays).toEqual([3, 1]);
  });

  it("cleans junk: whole days 1 to 30, no repeats, at most five, largest first", () => {
    expect(sanitizeRemindLeadDays([1, 1, 0, -2, 31, 2.5, 7, "3" as never])).toEqual([7, 1]);
    expect(sanitizeRemindLeadDays([1, 2, 3, 5, 7, 9, 10])).toHaveLength(5);
    expect(sanitizeRemindLeadDays(null)).toEqual([]);
    expect(sanitizeRemindLeadDays(undefined)).toEqual([]);
  });

  it("toggles a day, never beyond five", () => {
    expect(toggleRemindLeadDay([], 3)).toEqual([3]);
    expect(toggleRemindLeadDay([3], 7)).toEqual([7, 3]);
    expect(toggleRemindLeadDay([7, 3], 3)).toEqual([7]);
    expect(toggleRemindLeadDay([9, 7, 5, 3, 2], 1)).toEqual([9, 7, 5, 3, 2]);
  });

  it("sends the days on create only when some are chosen (omitted means off)", () => {
    const withDays = buildCreateBody("subscription", form({ ...emptyRecurringForm("subscription", TODAY), name: "Rent", amountText: "9000", categoryId: "c", remindLeadDays: [3, 1] }), TZ, TODAY);
    expect(withDays).toMatchObject({ remind_lead_days: [3, 1] });
    const without = buildCreateBody("subscription", form({ ...emptyRecurringForm("subscription", TODAY), name: "Rent", amountText: "9000", categoryId: "c" }), TZ, TODAY);
    expect(without).not.toHaveProperty("remind_lead_days");
  });

  it("sends a changed list on update, and null when the reminder is turned off", () => {
    const on = item({ remind_lead_days: [3, 1] });
    expect(buildUpdateBody(on, formFromItem(on), TZ)).toEqual({});
    expect(
      buildUpdateBody(on, { ...formFromItem(on), remindLeadDays: [7, 3, 1] }, TZ),
    ).toEqual({ remind_lead_days: [7, 3, 1] });
    expect(buildUpdateBody(on, { ...formFromItem(on), remindLeadDays: [] }, TZ)).toEqual({
      remind_lead_days: null,
    });
    // Off stays off: nothing to send.
    expect(buildUpdateBody(item(), { ...formFromItem(item()), remindLeadDays: [] }, TZ)).toEqual({});
    expect(
      buildUpdateBody(item(), { ...formFromItem(item()), remindLeadDays: [2] }, TZ),
    ).toEqual({ remind_lead_days: [2] });
  });
});
