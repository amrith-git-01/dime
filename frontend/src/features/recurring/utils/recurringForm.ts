import { getDaysInMonth } from "date-fns";

import {
  paiseToAmountString,
  parseAmountInputToPaise,
  toPaise,
} from "@/utils/paise";

import type {
  CreateRecurringBody,
  RecurringFormState,
  RecurringItem,
  RecurringKind,
  UpdateRecurringBody,
} from "../types";

/** The API stores money with at most 10 whole digits. */
export const MAX_AMOUNT_WHOLE_DIGITS = 10;
export const MAX_NAME_LENGTH = 80;
export const MAX_NOTE_LENGTH = 200;

/** Whether "Already received/paid this period?" starts ticked: yes for salary, no for bills. */
export function defaultPostCurrentPeriod(kind: RecurringKind): boolean {
  return kind === "income";
}

export function emptyRecurringForm(
  kind: RecurringKind,
  today: Date,
  incomeCategoryId: string | null = null,
): RecurringFormState {
  return {
    name: "",
    amountText: "",
    cadence: "monthly",
    dayOfMonthText: String(today.getDate()),
    monthOfYear: today.getMonth() + 1,
    categoryId: kind === "income" ? incomeCategoryId : null,
    note: "",
    active: true,
    postCurrentPeriod: defaultPostCurrentPeriod(kind),
  };
}

export function formFromItem(item: RecurringItem): RecurringFormState {
  return {
    name: item.name,
    amountText: paiseToAmountString(toPaise(item.amount)),
    cadence: item.cadence,
    dayOfMonthText: String(item.day_of_month),
    monthOfYear: item.month_of_year ?? 1,
    categoryId: item.category_id,
    note: item.note ?? "",
    active: item.active,
    postCurrentPeriod: false,
  };
}

/** Day typed by the user, or null when it is not a whole number from 1 to 31. */
export function parseDayOfMonth(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,2}$/.test(trimmed)) {
    return null;
  }
  const day = Number(trimmed);
  return day >= 1 && day <= 31 ? day : null;
}

export type RecurringFormField = "name" | "amount" | "day" | "month" | "note";

export type RecurringFormValidation =
  | { ok: true; paise: number; dayOfMonth: number }
  | { ok: false; field: RecurringFormField; error: string };

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function validateRecurringForm(
  form: RecurringFormState,
): RecurringFormValidation {
  const name = form.name.trim();
  if (name.length === 0) {
    return { ok: false, field: "name", error: "Enter a name." };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      field: "name",
      error: `Name can be at most ${MAX_NAME_LENGTH} characters.`,
    };
  }
  const paise = parseAmountInputToPaise(form.amountText);
  if (paise === null) {
    return {
      ok: false,
      field: "amount",
      error: "Enter an amount greater than zero.",
    };
  }
  if (String(Math.trunc(paise / 100)).length > MAX_AMOUNT_WHOLE_DIGITS) {
    return {
      ok: false,
      field: "amount",
      error: `Amount can have at most ${MAX_AMOUNT_WHOLE_DIGITS} digits before the decimal point.`,
    };
  }
  const dayOfMonth = parseDayOfMonth(form.dayOfMonthText);
  if (dayOfMonth === null) {
    return {
      ok: false,
      field: "day",
      error: "Day of month must be between 1 and 31.",
    };
  }
  if (
    form.cadence === "yearly" &&
    !(form.monthOfYear >= 1 && form.monthOfYear <= 12)
  ) {
    return { ok: false, field: "month", error: "Choose a month." };
  }
  if (form.note.trim().length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      field: "note",
      error: `Note can be at most ${MAX_NOTE_LENGTH} characters.`,
    };
  }
  return { ok: true, paise, dayOfMonth };
}

/** Short months use their last day, so "31" means the 30th/28th where needed. */
export function effectiveDayInMonth(
  dayOfMonth: number,
  year: number,
  monthIndex0: number,
): number {
  return Math.min(dayOfMonth, getDaysInMonth(new Date(year, monthIndex0, 1)));
}

/**
 * True when this period's due day is already behind us, so the app can offer to add it now
 * ("Already received this month?"). Monthly: this month's day came earlier than today. Yearly:
 * this year's due date came earlier than today. Due today does not count: it is still ahead.
 */
export function isCurrentPeriodDuePassed(
  schedule: {
    cadence: RecurringFormState["cadence"];
    dayOfMonth: number;
    monthOfYear: number;
  },
  today: Date,
): boolean {
  const year = today.getFullYear();
  const monthIndex0 =
    schedule.cadence === "yearly" ? schedule.monthOfYear - 1 : today.getMonth();
  const due = new Date(
    year,
    monthIndex0,
    effectiveDayInMonth(schedule.dayOfMonth, year, monthIndex0),
  );
  const startOfToday = new Date(year, today.getMonth(), today.getDate());
  return due.getTime() < startOfToday.getTime();
}

function noteOrNull(note: string): string | null {
  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildCreateBody(
  kind: RecurringKind,
  form: RecurringFormState,
  timezone: string,
  today: Date,
): CreateRecurringBody | null {
  const checked = validateRecurringForm(form);
  if (!checked.ok) {
    return null;
  }
  const body: CreateRecurringBody = {
    kind,
    name: form.name.trim(),
    amount: paiseToAmountString(checked.paise),
    cadence: form.cadence,
    day_of_month: checked.dayOfMonth,
    timezone,
    active: form.active,
  };
  if (form.categoryId) {
    body.category_id = form.categoryId;
  }
  if (form.cadence === "yearly") {
    body.month_of_year = form.monthOfYear;
  }
  const note = noteOrNull(form.note);
  if (note) {
    body.note = note;
  }
  const offered = isCurrentPeriodDuePassed(
    {
      cadence: form.cadence,
      dayOfMonth: checked.dayOfMonth,
      monthOfYear: form.monthOfYear,
    },
    today,
  );
  if (offered && form.postCurrentPeriod) {
    body.post_current_period = true;
  }
  return body;
}

/** Only the fields the user changed (PATCH is partial); `null` when the form is invalid. */
export function buildUpdateBody(
  item: RecurringItem,
  form: RecurringFormState,
  timezone: string,
): UpdateRecurringBody | null {
  const checked = validateRecurringForm(form);
  if (!checked.ok) {
    return null;
  }
  const body: UpdateRecurringBody = {};
  const name = form.name.trim();
  if (name !== item.name) {
    body.name = name;
  }
  if (checked.paise !== toPaise(item.amount)) {
    body.amount = paiseToAmountString(checked.paise);
  }
  if (form.categoryId !== item.category_id) {
    body.category_id = form.categoryId;
  }
  if (noteOrNull(form.note) !== (item.note ?? null)) {
    body.note = noteOrNull(form.note);
  }
  if (form.active !== item.active) {
    body.active = form.active;
  }

  const monthChanged =
    form.cadence === "yearly" && form.monthOfYear !== item.month_of_year;
  const cadenceChanged = form.cadence !== item.cadence;
  const dayChanged = checked.dayOfMonth !== item.day_of_month;
  if (cadenceChanged || monthChanged) {
    body.cadence = form.cadence;
    if (form.cadence === "yearly") {
      body.month_of_year = form.monthOfYear;
    }
  }
  if (dayChanged) {
    body.day_of_month = checked.dayOfMonth;
  }
  if (cadenceChanged || monthChanged || dayChanged) {
    // The next due date is worked out in this timezone, so tell the server which one.
    body.timezone = timezone;
  }
  return body;
}

export function hasChanges(body: UpdateRecurringBody): boolean {
  return Object.keys(body).length > 0;
}
