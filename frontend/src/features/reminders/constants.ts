import type { ReminderCadence } from "./types";

/** Lead-day choices on the editor: 0 is "on the day", the rest are days before. */
export const REMINDER_LEAD_DAY_OPTIONS: readonly number[] = [0, 1, 2, 3, 5, 7];

/**
 * Recurring items post at 06:00 on their due date, so "on the day" can never be sent for them:
 * the API accepts 1..30 only.
 */
export const RECURRING_LEAD_DAY_OPTIONS: readonly number[] = [1, 2, 3, 5, 7];

/** A reminder (and the default list) holds at most this many lead days. */
export const MAX_LEAD_DAY_ENTRIES = 5;

export const MAX_TITLE_LENGTH = 80;
export const MAX_NAME_LENGTH = 80;
/** The API stores money with at most 10 whole digits. */
export const MAX_AMOUNT_WHOLE_DIGITS = 10;
/** How far back a new reminder may be dated (the API refuses anything older). */
export const MAX_DAYS_IN_PAST = 1;

/** Home's Upcoming card shows at most this many overdue reminders (the oldest). */
export const MAX_OVERDUE_ON_HOME = 2;

/** Home's Upcoming card shows reminders overdue or due within this many days. */
export const REMINDER_UPCOMING_WINDOW_DAYS = 30;
/** Reminders due within this many days sit under "Due soon"; later ones under "Later". */
export const REMINDER_DUE_SOON_DAYS = 7;

/** UPI id (`name@bank`), the same rule the API applies. */
export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9]{2,32}$/;

/**
 * The largest lead day a repeat allows: a weekly reminder repeats before a longer lead would end,
 * monthly and yearly stop at 27 so every month has the day.
 */
export function leadDayCap(cadence: ReminderCadence): number {
  switch (cadence) {
    case "weekly":
      return 6;
    case "monthly":
    case "yearly":
      return 27;
    default:
      return 30;
  }
}

export function isRepeating(cadence: ReminderCadence): boolean {
  return cadence !== "none";
}
