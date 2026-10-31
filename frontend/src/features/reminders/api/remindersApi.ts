import { dimeApi } from "@/lib/api/dimeApi";
import { parseDueDate } from "@/features/recurring/utils/recurringDisplay";

import type {
  CreateReminderBody,
  Reminder,
  ReminderCadence,
  ReminderDirection,
  ReminderListStatus,
  ReminderStatus,
  ReminderSuggestedMatch,
  UpdateReminderBody,
} from "../types";

const PATH = "/api/v1/reminders";

type Obj = Record<string, unknown>;

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function obj(value: unknown): Obj | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Obj)
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** A decimal string like the API sends ("15000.00"); a number is accepted; anything else is null. */
function money(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return value;
  }
  return null;
}

function isCalendarDay(value: unknown): value is string {
  return typeof value === "string" && DAY.test(value) && parseDueDate(value) !== null;
}

function direction(value: unknown): ReminderDirection | null {
  return value === "pay" || value === "receive" ? value : null;
}

function cadence(value: unknown): ReminderCadence {
  return value === "weekly" || value === "monthly" || value === "yearly" ? value : "none";
}

function status(value: unknown): ReminderStatus | null {
  return value === "open" || value === "done" || value === "dismissed" ? value : null;
}

/** Whole days 0..30, no repeats; null when it is not a list at all. */
function leadDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const days: number[] = [];
  for (const day of value) {
    if (typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 30 && !days.includes(day)) {
      days.push(day);
    }
  }
  return days;
}

function mapMatch(raw: unknown): ReminderSuggestedMatch | null {
  const item = obj(raw);
  const transactionId = nonEmpty(item?.transaction_id);
  const amount = money(item?.amount);
  // A suggestion needs something to act on (the transaction) and something to say (its amount).
  if (!item || !transactionId || amount === null) {
    return null;
  }
  return {
    transaction_id: transactionId,
    amount,
    display_name: typeof item.display_name === "string" ? item.display_name : "",
    date: isCalendarDay(item.date) ? item.date : "",
  };
}

/**
 * Defensive read of one reminder: a newer or older server may leave fields out or send a value this
 * build does not know. Anything that cannot be shown or acted on (no id, no valid due date, an unknown
 * direction or status) makes the whole item unusable (null); lesser problems fall back to a default.
 */
export function mapReminder(raw: unknown): Reminder | null {
  const item = obj(raw);
  const id = nonEmpty(item?.id);
  const dir = direction(item?.direction);
  const state = status(item?.status);
  if (!item || !id || !dir || !state || !isCalendarDay(item.due_date)) {
    return null;
  }
  const stored = leadDays(item.lead_days);
  return {
    id,
    direction: dir,
    title: nonEmpty(item.title) ?? "Reminder",
    amount: money(item.amount),
    counterparty_name: nonEmpty(item.counterparty_name),
    upi_id: nonEmpty(item.upi_id),
    due_date: item.due_date,
    cadence: cadence(item.cadence),
    lead_days: stored,
    effective_lead_days: leadDays(item.effective_lead_days) ?? stored ?? [],
    remind_time: typeof item.remind_time === "string" && HH_MM.test(item.remind_time) ? item.remind_time : null,
    timezone: nonEmpty(item.timezone) ?? "Asia/Kolkata",
    status: state,
    completed_at: nonEmpty(item.completed_at),
    next_fire_at: nonEmpty(item.next_fire_at),
    suggested_match: mapMatch(item.suggested_match),
  };
}

/** Rows of the list endpoint; an unusable row is dropped, anything but a list reads as empty. */
export function mapReminders(raw: unknown): Reminder[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const items: Reminder[] = [];
  for (const row of raw) {
    const reminder = mapReminder(row);
    if (reminder) {
      items.push(reminder);
    }
  }
  return items;
}

/** Most reminders one list call asks for (the API allows 200). */
const LIST_LIMIT = 200;

export async function fetchReminders(
  status: ReminderListStatus = "open",
): Promise<Reminder[]> {
  const { data } = await dimeApi.get<{ items: unknown }>(PATH, {
    params: { status, limit: LIST_LIMIT },
  });
  return mapReminders(data?.items);
}

export async function createReminder(body: CreateReminderBody): Promise<Reminder | null> {
  const { data } = await dimeApi.post<unknown>(PATH, body);
  return mapReminder(data);
}

export async function updateReminder(
  id: string,
  body: UpdateReminderBody,
): Promise<Reminder | null> {
  const { data } = await dimeApi.patch<unknown>(`${PATH}/${id}`, body);
  return mapReminder(data);
}

export async function deleteReminder(id: string): Promise<void> {
  await dimeApi.delete(`${PATH}/${id}`);
}

/** Marks a reminder paid; `transactionId` ties it to the transaction that paid it. A repeating one moves on. */
export async function completeReminder(
  id: string,
  transactionId?: string,
): Promise<Reminder | null> {
  const { data } = await dimeApi.post<unknown>(
    `${PATH}/${id}/complete`,
    transactionId ? { transaction_id: transactionId } : {},
  );
  return mapReminder(data);
}

/** Moves a repeating reminder to its next date without completing it. */
export async function skipReminder(id: string): Promise<Reminder | null> {
  const { data } = await dimeApi.post<unknown>(`${PATH}/${id}/skip`, {});
  return mapReminder(data);
}
