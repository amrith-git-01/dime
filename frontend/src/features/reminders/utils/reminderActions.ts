import { format } from "date-fns";
import { Linking, Share } from "react-native";
import ShareSheet from "react-native-share";

import { parseDueDate } from "@/features/recurring/utils/recurringDisplay";
import type { ReportRoastLevel } from "@/features/settings/types";

import type { Reminder } from "../types";
import { buildNudgeMessage, formatShareAmount } from "./nudgeMessage";
import { writeNudgeQrCard } from "./nudgeQrCard";
import { buildUpiUri, normalizePayAmount } from "./payLinks";

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

/** The note a payer sees in their UPI app: the title and when it is due, e.g. "Dinner split (due 15 Nov)". */
export function payNoteFor(reminder: Reminder): string {
  const due = parseDueDate(reminder.due_date);
  const title = reminder.title.trim();
  return due ? `${title} (due ${format(due, "d MMM")})` : title;
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
    note: payNoteFor(reminder),
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
  /** My UPI ID from settings; the QR code is added only when it is set. */
  myUpiId: string | null;
  /** My name for the QR card ("Pay ₹800 to Amrith"); optional. */
  myName: string | null;
  today: Date;
};

/** The text of a nudge for a "receive" reminder (also the caption of the QR card). */
export function nudgeMessageFor(reminder: Reminder, context: NudgeContext): string {
  return buildNudgeMessage({
    level: context.level,
    reminderId: reminder.id,
    title: reminder.title,
    name: reminder.counterparty_name,
    amount: reminder.amount,
    dueDate: reminder.due_date,
    today: context.today,
  });
}

/** The `upi://pay` address for the QR code; null without a payable amount (up to the limit) and a valid UPI ID. */
function nudgeQrPayload(reminder: Reminder, context: NudgeContext): string | null {
  if (normalizePayAmount(reminder.amount) === null) {
    return null;
  }
  return buildUpiUri({
    upiId: context.myUpiId ?? "",
    name: context.myName,
    amount: reminder.amount,
    note: payNoteFor(reminder),
  });
}

/** Shares the QR card with the message as its caption; false when that fails (the caller sends the text instead). */
async function shareQrCard(fileUri: string, message: string): Promise<boolean> {
  try {
    // Closing the sheet is not an error (`failOnCancel: false`).
    await ShareSheet.open({
      url: fileUri,
      type: "image/png",
      message,
      title: "Send a nudge",
      failOnCancel: false,
    });
    return true;
  } catch {
    // An image without its caption would lose the nudge: send the text instead.
    return false;
  }
}

/**
 * Opens the Share sheet with the nudge: the QR card image (message as caption) when the reminder has
 * a payable amount and I have a UPI ID, else the plain text. False when nothing could be opened.
 */
export async function shareNudge(
  reminder: Reminder,
  context: NudgeContext,
): Promise<boolean> {
  const message = nudgeMessageFor(reminder, context);
  const payload = nudgeQrPayload(reminder, context);
  const money = reminder.amount === null ? null : formatShareAmount(reminder.amount);
  if (payload !== null && money !== null && context.myUpiId) {
    const name = context.myName?.trim();
    const fileUri = await writeNudgeQrCard({
      payload,
      title: name ? `Pay ${money} to ${name}` : `Pay ${money}`,
      note: payNoteFor(reminder),
      upiId: context.myUpiId.trim(),
    });
    if (fileUri && (await shareQrCard(fileUri, message))) {
      return true;
    }
  }
  try {
    await Share.share({ message });
    return true;
  } catch {
    return false;
  }
}
