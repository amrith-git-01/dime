import {
  selectUpcoming,
  UPCOMING_MAX_ITEMS,
  UPCOMING_WINDOW_DAYS,
} from "@/features/recurring/utils/recurringDisplay";
import type { RecurringItem } from "@/features/recurring/types";

import { MAX_OVERDUE_ON_HOME, REMINDER_UPCOMING_WINDOW_DAYS } from "../constants";
import type { Reminder } from "../types";
import { daysUntilDue } from "./reminderDates";

/** One row of Home's Upcoming card: a recurring item or a reminder, both with the date they fall on. */
export type UpcomingEntry =
  | { kind: "recurring"; id: string; dueDate: string; item: RecurringItem }
  | { kind: "reminder"; id: string; dueDate: string; reminder: Reminder };

function rank(entry: UpcomingEntry): number {
  // Same day: a reminder (something to act on) first, then salary, then bills.
  if (entry.kind === "reminder") {
    return 0;
  }
  return entry.item.kind === "income" ? 1 : 2;
}

/**
 * Recurring items due in the coming days merged with open reminders that are overdue or due in the
 * coming days, soonest first (overdue reminders lead), capped like the card always was. At most
 * `MAX_OVERDUE_ON_HOME` overdue reminders (the oldest) take part, so a pile of old ones cannot push the
 * next salary or bill off the card; the Reminders list holds the rest. Ids are prefixed with the kind
 * so a recurring item and a reminder can never collide as list keys.
 */
export function selectUpcomingEntries(input: {
  recurring: readonly RecurringItem[];
  reminders: readonly Reminder[];
  today: Date;
  windowDays?: number;
  max?: number;
}): UpcomingEntry[] {
  const {
    recurring,
    reminders,
    today,
    windowDays = UPCOMING_WINDOW_DAYS,
    max = UPCOMING_MAX_ITEMS,
  } = input;
  const entries: UpcomingEntry[] = [];

  for (const item of selectUpcoming(recurring, today, windowDays, Number.MAX_SAFE_INTEGER)) {
    entries.push({
      kind: "recurring",
      id: `recurring:${item.id}`,
      dueDate: item.next_due_date,
      item,
    });
  }
  const reminderWindow = Math.max(windowDays, REMINDER_UPCOMING_WINDOW_DAYS);
  const overdue: Reminder[] = [];
  const upcoming: Reminder[] = [];
  for (const reminder of reminders) {
    if (reminder.status !== "open") {
      continue;
    }
    const days = daysUntilDue(reminder.due_date, today);
    if (days === null || days > reminderWindow) {
      continue;
    }
    (days < 0 ? overdue : upcoming).push(reminder);
  }
  overdue.sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  for (const reminder of [...overdue.slice(0, MAX_OVERDUE_ON_HOME), ...upcoming]) {
    entries.push({
      kind: "reminder",
      id: `reminder:${reminder.id}`,
      dueDate: reminder.due_date,
      reminder,
    });
  }

  return entries
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return rank(a) - rank(b);
    })
    .slice(0, max);
}
