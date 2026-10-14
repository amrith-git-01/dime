import { differenceInCalendarDays, format, isValid, parse } from "date-fns";

import { formatInrAmount } from "@/utils/currency";

import type {
  RecurringCadence,
  RecurringItem,
  RecurringKind,
  RecurringOccurrence,
} from "../types";

export const UPCOMING_WINDOW_DAYS = 30;
export const UPCOMING_MAX_ITEMS = 4;

/** `YYYY-MM-DD` as a local calendar date (no timezone shifts), or null when malformed. */
export function parseDueDate(isoDate: string): Date | null {
  const parsed = parse(isoDate, "yyyy-MM-dd", new Date(2000, 0, 1));
  return isValid(parsed) ? parsed : null;
}

/** "Due today", "Due tomorrow", "Due in 5 days" (within a week), else "Due 15 Nov". */
export function formatDueDate(isoDate: string, today: Date): string {
  const due = parseDueDate(isoDate);
  if (!due) {
    return "";
  }
  const days = differenceInCalendarDays(due, today);
  if (days === 0) {
    return "Due today";
  }
  if (days === 1) {
    return "Due tomorrow";
  }
  if (days > 1 && days <= 7) {
    return `Due in ${days} days`;
  }
  const sameYear = due.getFullYear() === today.getFullYear();
  return `Due ${format(due, sameYear ? "d MMM" : "d MMM yyyy")}`;
}

export function formatCadence(cadence: RecurringCadence): string {
  return cadence === "yearly" ? "Yearly" : "Monthly";
}

/** "Monthly · Due 15 Nov", or "Monthly · Paused" for inactive items. */
export function formatRecurringSubtitle(
  item: RecurringItem,
  today: Date,
): string {
  const cadence = formatCadence(item.cadence);
  if (!item.active) {
    return `${cadence} · Paused`;
  }
  const due = formatDueDate(item.next_due_date, today);
  return due ? `${cadence} · ${due}` : cadence;
}

/** "≈ ₹ 100.00/mo" for yearly items, so they compare with monthly ones. */
export function formatMonthlyEquivalent(item: RecurringItem): string | null {
  return item.cadence === "yearly"
    ? `≈ ${formatInrAmount(item.monthly_equivalent)}/mo`
    : null;
}

function kindRank(kind: RecurringKind): number {
  return kind === "income" ? 0 : 1;
}

/** Active items due in the next `windowDays` days, soonest first (ties: income before bills). */
export function selectUpcoming(
  items: readonly RecurringItem[],
  today: Date,
  windowDays: number = UPCOMING_WINDOW_DAYS,
  max: number = UPCOMING_MAX_ITEMS,
): RecurringItem[] {
  return items
    .filter((item) => {
      if (!item.active) {
        return false;
      }
      const due = parseDueDate(item.next_due_date);
      if (!due) {
        return false;
      }
      const days = differenceInCalendarDays(due, today);
      return days >= 0 && days <= windowDays;
    })
    .sort((a, b) => {
      if (a.next_due_date !== b.next_due_date) {
        return a.next_due_date < b.next_due_date ? -1 : 1;
      }
      return kindRank(a.kind) - kindRank(b.kind);
    })
    .slice(0, max);
}

/** "15 Oct" or "15 Oct 2025": the occurrence date, without the "Due" wording. */
export function formatOccurrenceDate(isoDate: string, today: Date): string {
  const date = parseDueDate(isoDate);
  if (!date) {
    return "";
  }
  return format(date, date.getFullYear() === today.getFullYear() ? "d MMM" : "d MMM yyyy");
}

/** "Paid 1 Oct", "Due 15 Nov" (or "Due today"), "Skipped". */
export function formatOccurrenceSubtitle(
  occurrence: Pick<RecurringOccurrence, "status" | "due_date">,
  today: Date,
): string {
  if (occurrence.status === "paid") {
    return `Paid ${formatOccurrenceDate(occurrence.due_date, today)}`.trim();
  }
  if (occurrence.status === "skipped") {
    return "Skipped";
  }
  return formatDueDate(occurrence.due_date, today);
}

export const RECURRING_COPY = {
  income: {
    screenTitle: "Recurring income",
    editTitle: "Edit recurring income",
    addTitle: "Add recurring income",
    summaryKicker: "Recurring income",
    emptyHeadline: "No recurring income set up yet",
    emptySubtext:
      "Add your salary or other regular income and Dime will log it for you.",
    addAction: "Add recurring income",
    namePlaceholder: "e.g. Salary, Rent received",
    deleteTitle: "Delete this recurring income?",
    deleteMessage:
      "It stops repeating. Transactions already added stay in your history.",
    activeSubtitle: "Turn off to pause this without deleting it.",
    createdToast: "Recurring income added",
    updatedToast: "Recurring income updated",
    deletedToast: "Recurring income deleted",
  },
  subscription: {
    screenTitle: "Recurring expenses",
    editTitle: "Edit recurring expense",
    addTitle: "Add recurring expense",
    summaryKicker: "Recurring expenses",
    emptyHeadline: "No recurring expenses yet",
    emptySubtext:
      "Add the bills that repeat and Dime will log them and show what is coming up.",
    addAction: "Add recurring expense",
    namePlaceholder: "e.g. Netflix, Gym, Rent",
    deleteTitle: "Delete this recurring expense?",
    deleteMessage:
      "It stops repeating. Transactions already added stay in your history.",
    activeSubtitle: "Turn off to pause this without deleting it.",
    createdToast: "Recurring expense added",
    updatedToast: "Recurring expense updated",
    deletedToast: "Recurring expense deleted",
  },
} as const;

/** Copy for the "Already received / paid this period?" switch. */
export function postCurrentPeriodLabel(
  kind: RecurringKind,
  cadence: RecurringCadence,
): string {
  const period = cadence === "yearly" ? "this year" : "this month";
  return kind === "income"
    ? `Already received ${period}? Add it now`
    : `Already paid ${period}? Add it now`;
}
