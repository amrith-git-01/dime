import { format, parseISO } from "date-fns";

import { formatInrAmount } from "@/utils/currency";

import type { Reminder } from "../types";
import {
  dueLabel,
  formatCadenceLabel,
  formatLongDate,
} from "./reminderDates";

/** "Mark paid" for money going out, "Mark received" for money coming in. */
export function markDoneLabel(reminder: Pick<Reminder, "direction">): string {
  return reminder.direction === "receive" ? "Mark received" : "Mark paid";
}

/** Who the other side is, in words: "to Landlord" / "from Ravi", or "". */
export function counterpartyPhrase(
  reminder: Pick<Reminder, "direction" | "counterparty_name">,
): string {
  const name = reminder.counterparty_name?.trim();
  if (!name) {
    return "";
  }
  return reminder.direction === "receive" ? `from ${name}` : `to ${name}`;
}

/** "Paid 3 Nov", "Received 3 Nov", or "Dismissed" for a finished reminder. */
export function formatClosedLine(
  reminder: Pick<Reminder, "status" | "direction" | "completed_at">,
): string {
  if (reminder.status === "dismissed") {
    return "Dismissed";
  }
  const verb = reminder.direction === "receive" ? "Received" : "Paid";
  if (!reminder.completed_at) {
    return verb;
  }
  const when = parseISO(reminder.completed_at);
  return Number.isNaN(when.getTime()) ? verb : `${verb} ${format(when, "d MMM")}`;
}

/**
 * The whole row as one sentence for a screen reader: what it is, the full amount, who with, when it
 * is due (in words and as a date) and whether it repeats.
 */
export function reminderAccessibilityLabel(reminder: Reminder, today: Date): string {
  const parts: string[] = [reminder.title];
  parts.push(reminder.direction === "receive" ? "to receive" : "to pay");
  if (reminder.amount !== null) {
    parts.push(formatInrAmount(reminder.amount));
  }
  const who = counterpartyPhrase(reminder);
  if (who) {
    parts.push(who);
  }
  if (reminder.status === "open") {
    const due = dueLabel(reminder.due_date, today).text;
    const date = formatLongDate(reminder.due_date);
    parts.push(date ? `${due}, ${date}` : due);
  } else {
    parts.push(formatClosedLine(reminder));
  }
  if (reminder.cadence !== "none") {
    parts.push(`repeats ${formatCadenceLabel(reminder.cadence).toLowerCase()}`);
  }
  return parts.filter(Boolean).join(", ");
}
