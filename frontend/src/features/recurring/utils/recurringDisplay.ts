import { differenceInCalendarDays, format, isValid, parse } from "date-fns";

import { formatInrAmount } from "@/utils/currency";

import type { RecurringCadence, RecurringItem, RecurringKind } from "../types";

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

export const RECURRING_COPY = {
  income: {
    screenTitle: "Salary & income",
    editTitle: "Edit income",
    addTitle: "Add income",
    hubLabel: "Salary & income",
    hubSubtitle: "Salary and other income that repeats every month or year",
    summaryKicker: "Monthly income",
    emptyHeadline: "No income set up yet",
    emptySubtext:
      "Add your salary or other regular income and Dime will log it for you.",
    addAction: "Add income",
    namePlaceholder: "e.g. Salary, Rent received",
    deleteTitle: "Delete this income?",
    deleteMessage:
      "It stops repeating. Transactions already added stay in your history.",
    activeSubtitle: "Turn off to pause this without deleting it.",
    createdToast: "Income added",
    updatedToast: "Income updated",
    deletedToast: "Income deleted",
  },
  subscription: {
    screenTitle: "Subscriptions",
    editTitle: "Edit subscription",
    addTitle: "Add subscription",
    hubLabel: "Subscriptions",
    hubSubtitle: "Netflix, rent, bills and other payments that repeat",
    summaryKicker: "Monthly subscriptions",
    emptyHeadline: "No subscriptions yet",
    emptySubtext:
      "Add the bills that repeat and Dime will log them and show what is coming up.",
    addAction: "Add subscription",
    namePlaceholder: "e.g. Netflix, Gym, Rent",
    deleteTitle: "Delete this subscription?",
    deleteMessage:
      "It stops repeating. Transactions already added stay in your history.",
    activeSubtitle: "Turn off to pause this without deleting it.",
    createdToast: "Subscription added",
    updatedToast: "Subscription updated",
    deletedToast: "Subscription deleted",
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
