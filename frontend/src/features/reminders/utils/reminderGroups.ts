import type { Reminder } from "../types";
import { REMINDER_DUE_SOON_DAYS } from "../constants";
import { daysUntilDue } from "./reminderDates";

export type ReminderSectionId = "overdue" | "dueSoon" | "later";

export type ReminderSection = {
  id: ReminderSectionId;
  title: string;
  items: Reminder[];
};

const TITLES: Record<ReminderSectionId, string> = {
  overdue: "Overdue",
  dueSoon: "Due soon",
  later: "Later",
};

function byDueDate(a: Reminder, b: Reminder): number {
  if (a.due_date !== b.due_date) {
    return a.due_date < b.due_date ? -1 : 1;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Open reminders in sections, oldest due date first inside each: Overdue (before today), Due soon
 * (today up to a week), Later. Empty sections are left out, and a reminder that is not open (or has
 * a malformed date) is never listed.
 */
export function groupOpenReminders(
  reminders: readonly Reminder[],
  today: Date,
): ReminderSection[] {
  const buckets: Record<ReminderSectionId, Reminder[]> = {
    overdue: [],
    dueSoon: [],
    later: [],
  };
  for (const reminder of reminders) {
    if (reminder.status !== "open") {
      continue;
    }
    const days = daysUntilDue(reminder.due_date, today);
    if (days === null) {
      continue;
    }
    const id: ReminderSectionId =
      days < 0 ? "overdue" : days <= REMINDER_DUE_SOON_DAYS ? "dueSoon" : "later";
    buckets[id].push(reminder);
  }
  return (Object.keys(buckets) as ReminderSectionId[])
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, title: TITLES[id], items: buckets[id].sort(byDueDate) }));
}

/** Finished reminders, the most recently closed first. */
export function sortDoneReminders(reminders: readonly Reminder[]): Reminder[] {
  return reminders
    .filter((reminder) => reminder.status !== "open")
    .sort((a, b) => {
      const left = a.completed_at ?? "";
      const right = b.completed_at ?? "";
      if (left !== right) {
        return left < right ? 1 : -1;
      }
      return b.due_date < a.due_date ? -1 : b.due_date > a.due_date ? 1 : 0;
    });
}
