import { differenceInCalendarDays, format } from "date-fns";

import {
  formatOccurrenceDate,
  parseDueDate,
} from "@/features/recurring/utils/recurringDisplay";

import type { Reminder, ReminderCadence } from "../types";

/** Calendar days from `today` to the due date (negative when overdue); null for a malformed date. */
export function daysUntilDue(dueDate: string, today: Date): number | null {
  const due = parseDueDate(dueDate);
  return due ? differenceInCalendarDays(due, today) : null;
}

/** `YYYY-MM-DD` of a local calendar day (no UTC shift). */
export function toDayString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** A `YYYY-MM-DD` as a local date at midnight; today when malformed. */
export function fromDayString(day: string): Date {
  return parseDueDate(day) ?? new Date();
}

export type DueTone = "overdue" | "today" | "soon" | "later";

/** How a reminder's due date reads: "Due today", "Due in 3 days", "2 days overdue", "Due 15 Nov". */
export function formatDueIn(days: number, dueDate: string, today: Date): string {
  if (days < 0) {
    return days === -1 ? "1 day overdue" : `${-days} days overdue`;
  }
  if (days === 0) {
    return "Due today";
  }
  if (days === 1) {
    return "Due tomorrow";
  }
  if (days <= 30) {
    return `Due in ${days} days`;
  }
  return `Due ${formatOccurrenceDate(dueDate, today)}`;
}

export function dueTone(days: number): DueTone {
  if (days < 0) {
    return "overdue";
  }
  if (days === 0) {
    return "today";
  }
  return days <= 7 ? "soon" : "later";
}

export function dueLabel(
  dueDate: string,
  today: Date,
): { text: string; tone: DueTone } {
  const days = daysUntilDue(dueDate, today);
  if (days === null) {
    return { text: "", tone: "later" };
  }
  return { text: formatDueIn(days, dueDate, today), tone: dueTone(days) };
}

/** "Sunday 15 November 2026" for screen readers. */
export function formatLongDate(dueDate: string): string {
  const due = parseDueDate(dueDate);
  return due ? format(due, "EEEE d MMMM yyyy") : "";
}

export function formatCadenceLabel(cadence: ReminderCadence): string {
  switch (cadence) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    default:
      return "Once";
  }
}

/** The line under a reminder's title: who it is with, then when. */
export function reminderSubtitle(reminder: Reminder, today: Date): string {
  const when = dueLabel(reminder.due_date, today).text;
  const name = reminder.counterparty_name?.trim();
  return [name, when].filter(Boolean).join(" · ");
}
