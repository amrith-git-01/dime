import { Linking, Share } from "react-native";

import { getDimeApiBaseUrl } from "@/lib/api/baseUrl";
import type { ReportRoastLevel } from "@/features/settings/types";

import type { Reminder } from "../types";
import { buildNudgeMessage } from "./nudgeMessage";
import { buildPayLink, buildUpiUri, normalizePayAmount } from "./payLinks";

/** "Pay now" needs somebody to pay and something to pay. */
export function canPayNow(reminder: Reminder): boolean {
  return (
    reminder.status === "open" &&
    reminder.direction === "pay" &&
    buildUpiUri({
      upiId: reminder.upi_id ?? "",
      amount: reminder.amount,
    }) !== null &&
    normalizePayAmount(reminder.amount) !== null
  );
}

/** "Nudge" is for money somebody owes the user. */
export function canNudge(reminder: Reminder): boolean {
  return reminder.status === "open" && reminder.direction === "receive";
}

export type PayNowResult = "opened" | "invalid" | "unavailable";

/**
 * Opens the user's UPI app on the `upi://pay` address of a "pay" reminder. `canOpenURL` is not used
 * (it needs an Android manifest entry): the open is simply tried, and a device with no UPI app is
 * "unavailable". Never throws, never logs the UPI id.
 */
export async function payNow(reminder: Reminder): Promise<PayNowResult> {
  const uri = buildUpiUri({
    upiId: reminder.upi_id ?? "",
    name: reminder.counterparty_name,
    amount: reminder.amount,
    note: reminder.title,
  });
  if (uri === null) {
    return "invalid";
  }
  try {
    await Linking.openURL(uri);
    return "opened";
  } catch {
    return "unavailable";
  }
}

export type NudgeContext = {
  level: ReportRoastLevel;
  /** My UPI ID from settings; the pay link is added only when it is set. */
  myUpiId: string | null;
  /** My name for the pay page ("Pay ₹800 to Amrith"); optional. */
  myName: string | null;
  today: Date;
};

/** The text the Share sheet gets for a "receive" reminder. */
export function nudgeMessageFor(reminder: Reminder, context: NudgeContext): string {
  const payLink = context.myUpiId
    ? buildPayLink({
        upiId: context.myUpiId,
        name: context.myName,
        amount: reminder.amount,
        note: reminder.title,
        apiOrigin: getDimeApiBaseUrl(),
      })
    : null;
  return buildNudgeMessage({
    level: context.level,
    reminderId: reminder.id,
    title: reminder.title,
    name: reminder.counterparty_name,
    // The link carries an amount only when the reminder has one.
    amount: reminder.amount,
    dueDate: reminder.due_date,
    today: context.today,
    payLink: reminder.amount !== null ? payLink : null,
  });
}

/** Opens the Share sheet with the nudge; false when it could not open. */
export async function shareNudge(
  reminder: Reminder,
  context: NudgeContext,
): Promise<boolean> {
  try {
    await Share.share({ message: nudgeMessageFor(reminder, context) });
    return true;
  } catch {
    return false;
  }
}
