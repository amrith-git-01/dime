import { paiseToAmountString, parseAmountInputToPaise, toPaise } from "@/utils/paise";

import {
  leadDayCap,
  MAX_AMOUNT_WHOLE_DIGITS,
  MAX_DAYS_IN_PAST,
  MAX_LEAD_DAY_ENTRIES,
  MAX_NAME_LENGTH,
  MAX_TITLE_LENGTH,
  UPI_ID_PATTERN,
} from "../constants";
import type {
  CreateReminderBody,
  Reminder,
  ReminderCadence,
  ReminderDirection,
  ReminderFormState,
  UpdateReminderBody,
} from "../types";
import { daysUntilDue, toDayString } from "./reminderDates";

export function emptyReminderForm(
  today: Date,
  direction: ReminderDirection = "pay",
): ReminderFormState {
  return {
    direction,
    amountText: "",
    title: "",
    name: "",
    upiId: "",
    dueDate: toDayString(today),
    cadence: "none",
    leadDays: null,
    remindTime: null,
  };
}

export function formFromReminder(reminder: Reminder): ReminderFormState {
  return {
    direction: reminder.direction,
    amountText:
      reminder.amount === null ? "" : paiseToAmountString(toPaise(reminder.amount)),
    title: reminder.title,
    name: reminder.counterparty_name ?? "",
    upiId: reminder.upi_id ?? "",
    dueDate: reminder.due_date,
    cadence: reminder.cadence,
    leadDays: reminder.lead_days,
    remindTime: reminder.remind_time,
  };
}

/** A valid UPI id as typed (trimmed), else null. */
export function parseUpiId(text: string): string | null {
  const trimmed = text.trim();
  return UPI_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/** Lead days a repeat allows, in the order given: the ones above the cap are dropped. */
export function clampLeadDays(
  days: readonly number[],
  cadence: ReminderCadence,
): number[] {
  const cap = leadDayCap(cadence);
  return days.filter((day) => day <= cap);
}

/** Adds or removes one lead day; never more than the allowed number, never above the cadence cap. */
export function toggleLeadDay(
  current: readonly number[],
  day: number,
  cadence: ReminderCadence,
): number[] {
  if (current.includes(day)) {
    return current.filter((existing) => existing !== day);
  }
  if (current.length >= MAX_LEAD_DAY_ENTRIES || day > leadDayCap(cadence)) {
    return [...current];
  }
  return [...current, day].sort((a, b) => b - a);
}

/** The lead days a reminder will use: its own list, else the user's default (within the cadence cap). */
export function effectiveLeadDays(
  form: Pick<ReminderFormState, "leadDays" | "cadence">,
  userDefault: readonly number[],
): number[] {
  return clampLeadDays(form.leadDays ?? userDefault, form.cadence);
}

export type ReminderFormField =
  | "title"
  | "amount"
  | "name"
  | "upi"
  | "date"
  | "leadDays";

export type ReminderFormContext = {
  today: Date;
  /** Editing: the saved due date. A date that has not moved may stay in the past. */
  savedDueDate?: string;
};

/** Every problem in the form, at most one message per field. */
export function collectFieldErrors(
  form: ReminderFormState,
  { today, savedDueDate }: ReminderFormContext,
): Partial<Record<ReminderFormField, string>> {
  const errors: Partial<Record<ReminderFormField, string>> = {};
  const title = form.title.trim();
  if (title.length === 0) {
    errors.title = "Enter a title.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title can be at most ${MAX_TITLE_LENGTH} characters.`;
  }

  if (form.amountText.trim().length > 0) {
    const paise = parseAmountInputToPaise(form.amountText);
    if (paise === null) {
      errors.amount = "Enter an amount greater than zero, or leave it empty.";
    } else if (String(Math.trunc(paise / 100)).length > MAX_AMOUNT_WHOLE_DIGITS) {
      errors.amount = `Amount can have at most ${MAX_AMOUNT_WHOLE_DIGITS} digits before the decimal point.`;
    }
  }

  if (form.name.trim().length > MAX_NAME_LENGTH) {
    errors.name = `Name can be at most ${MAX_NAME_LENGTH} characters.`;
  }

  if (
    form.direction === "pay" &&
    form.upiId.trim().length > 0 &&
    parseUpiId(form.upiId) === null
  ) {
    errors.upi = "Enter a UPI ID like name@bank.";
  }

  const days = daysUntilDue(form.dueDate, today);
  if (days === null) {
    errors.date = "Choose a due date.";
  } else if (form.dueDate !== savedDueDate && days < -MAX_DAYS_IN_PAST) {
    errors.date = "Choose today or a later date.";
  }

  if (form.leadDays !== null) {
    const cap = leadDayCap(form.cadence);
    if (form.leadDays.length > MAX_LEAD_DAY_ENTRIES) {
      errors.leadDays = `Choose at most ${MAX_LEAD_DAY_ENTRIES} reminder days.`;
    } else if (form.leadDays.some((day) => day > cap)) {
      errors.leadDays = `A ${form.cadence} reminder can start at most ${cap} days before.`;
    }
  }
  return errors;
}

const FIELD_ORDER: ReminderFormField[] = [
  "title",
  "amount",
  "name",
  "upi",
  "date",
  "leadDays",
];

export type ReminderFormValidation =
  | { ok: true }
  | { ok: false; field: ReminderFormField; error: string };

export function validateReminderForm(
  form: ReminderFormState,
  context: ReminderFormContext,
): ReminderFormValidation {
  const errors = collectFieldErrors(form, context);
  for (const field of FIELD_ORDER) {
    const error = errors[field];
    if (error) {
      return { ok: false, field, error };
    }
  }
  return { ok: true };
}

/**
 * Messages to show under the fields. Until the user has tried to save, an empty title stays quiet
 * (Save would simply complain); a field with something wrong in it speaks up at once.
 */
export function visibleFieldErrors(
  form: ReminderFormState,
  submitted: boolean,
  context: ReminderFormContext,
): Partial<Record<ReminderFormField, string>> {
  const errors = collectFieldErrors(form, context);
  if (!submitted && form.title.trim().length === 0) {
    delete errors.title;
  }
  return errors;
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The amount typed, as the API's decimal string; null when empty (or not a number). */
function amountOrNull(text: string): string | null {
  const paise = parseAmountInputToPaise(text);
  return paise === null ? null : paiseToAmountString(paise);
}

/** A receive reminder has no payee UPI ID: "My UPI ID" comes from settings. */
function upiOrNull(form: ReminderFormState): string | null {
  return form.direction === "pay" ? parseUpiId(form.upiId) : null;
}

export function buildCreateBody(
  form: ReminderFormState,
  timezone: string,
  context: ReminderFormContext,
): CreateReminderBody | null {
  if (!validateReminderForm(form, context).ok) {
    return null;
  }
  const body: CreateReminderBody = {
    direction: form.direction,
    title: form.title.trim(),
    due_date: form.dueDate,
    timezone,
    cadence: form.cadence,
  };
  const amount = amountOrNull(form.amountText);
  if (amount !== null) {
    body.amount = amount;
  }
  const name = textOrNull(form.name);
  if (name !== null) {
    body.counterparty_name = name;
  }
  const upi = upiOrNull(form);
  if (upi !== null) {
    body.upi_id = upi;
  }
  if (form.leadDays !== null) {
    body.lead_days = [...form.leadDays];
  }
  if (form.remindTime !== null) {
    body.remind_time = form.remindTime;
  }
  return body;
}

function sameDays(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.length === right.length && left.every((day, i) => day === right[i]);
}

/** Only the fields the user changed (PATCH is partial); `null` when the form is invalid. */
export function buildUpdateBody(
  reminder: Reminder,
  form: ReminderFormState,
  timezone: string,
  today: Date,
): UpdateReminderBody | null {
  if (!validateReminderForm(form, { today, savedDueDate: reminder.due_date }).ok) {
    return null;
  }
  const body: UpdateReminderBody = {};
  const title = form.title.trim();
  if (title !== reminder.title) {
    body.title = title;
  }
  if (form.direction !== reminder.direction) {
    body.direction = form.direction;
  }
  const amount = amountOrNull(form.amountText);
  if (toPaise(amount) !== toPaise(reminder.amount)) {
    body.amount = amount;
  }
  const name = textOrNull(form.name);
  if (name !== reminder.counterparty_name) {
    body.counterparty_name = name;
  }
  const upi = upiOrNull(form);
  if (upi !== reminder.upi_id) {
    body.upi_id = upi;
  }
  let scheduleChanged = false;
  if (form.dueDate !== reminder.due_date) {
    body.due_date = form.dueDate;
    scheduleChanged = true;
  }
  if (form.cadence !== reminder.cadence) {
    body.cadence = form.cadence;
    scheduleChanged = true;
  }
  if (!sameDays(form.leadDays, reminder.lead_days)) {
    body.lead_days = form.leadDays;
    scheduleChanged = true;
  }
  if (form.remindTime !== reminder.remind_time) {
    body.remind_time = form.remindTime;
    scheduleChanged = true;
  }
  if (scheduleChanged) {
    // The next fire time is worked out in this timezone, so tell the server which one.
    body.timezone = timezone;
  }
  return body;
}

export function hasChanges(body: UpdateReminderBody): boolean {
  return Object.keys(body).length > 0;
}
