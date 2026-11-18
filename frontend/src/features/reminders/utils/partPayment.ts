import { formatInrAmount } from "@/utils/currency";
import { parseAmountInputToPaise, toPaise } from "@/utils/paise";

import type { Reminder } from "../types";

/** The amount fields of a reminder (all a part payment needs to know). */
type ReminderAmounts = { amount?: Reminder["amount"]; remaining?: Reminder["remaining"] };

/** What is still due on the reminder's current due date, in paise; null when it has no amount. */
export function remainingPaise(reminder: ReminderAmounts): number | null {
  if (reminder.remaining != null) {
    return toPaise(reminder.remaining);
  }
  return reminder.amount == null ? null : toPaise(reminder.amount);
}

/** Paid so far toward the current due date, in paise (0 when nothing was, or the server predates part payments). */
export function paidPaise(reminder: Pick<Reminder, "paid_total">): number {
  return toPaise(reminder.paid_total);
}

/** Part of it has been paid and some is still due: the row says "₹300 paid · ₹700 left". */
export function hasPartPayment(reminder: Reminder): boolean {
  const left = remainingPaise(reminder);
  return reminder.status === "open" && paidPaise(reminder) > 0 && left !== null && left > 0;
}

/** "₹300 paid · ₹700 left", or null when nothing has been paid yet. */
export function partPaymentLine(reminder: Reminder): string | null {
  if (!hasPartPayment(reminder)) {
    return null;
  }
  const left = remainingPaise(reminder) ?? 0;
  return `${formatInrAmount(paidPaise(reminder) / 100)} paid · ${formatInrAmount(left / 100)} left`;
}

/** Whether paying `amount` (a typed decimal string) leaves part of the reminder still due. */
export function isPartPayment(reminder: ReminderAmounts, amount: string | undefined): boolean {
  if (!amount) {
    return false;
  }
  const left = remainingPaise(reminder);
  const paid = parseAmountInputToPaise(amount);
  return left !== null && paid !== null && paid < left;
}

/**
 * Checks a typed part payment: strict amount parsing, and not more than what is still due. Returns the decimal
 * string to send, or an error message.
 */
export function validatePartPayment(
  reminder: ReminderAmounts,
  text: string,
): { ok: true; amount: string } | { ok: false; error: string } {
  const paise = parseAmountInputToPaise(text);
  if (paise === null) {
    return { ok: false, error: "Enter an amount greater than zero, with at most two decimals." };
  }
  const left = remainingPaise(reminder);
  if (left !== null && paise > left) {
    return { ok: false, error: `That is more than the ${formatInrAmount(left / 100)} still due.` };
  }
  const whole = Math.trunc(paise / 100);
  const fraction = String(paise % 100).padStart(2, "0");
  return { ok: true, amount: `${whole}.${fraction}` };
}
