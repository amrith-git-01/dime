import { formatInrAmount, formatInrCompact } from "@/utils/currency";

export const READING_RECEIPT_TEXT = "Reading receipt…";
export const READING_VOICE_TEXT = "Reading voice note…";
export const STILL_READING_TEXT = "Still reading. We'll update the widget";
export const CAPTURE_FAILED_TEXT = "Couldn't read that. Try again or add it by hand";

/** "USD 12.00": what a foreign-currency capture read, for its note and its message. */
export function foreignAmountText(currency: string | null, amount: string | null): string {
  return [currency, amount].filter(Boolean).join(" ");
}

/** The card's line when a capture is in another currency: only the user can say what it is in rupees. */
export function needsReviewText(currency: string | null, amount: string | null): string {
  const read = foreignAmountText(currency, amount);
  return read ? `That receipt is in ${read}. Enter the rupee amount` : "Enter the rupee amount for that receipt";
}

/** Whole rupees stay short ("₹250"); paise show ("₹250.50"). */
function formatAmount(amount: string | number): string {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  return Number.isInteger(value) ? formatInrCompact(value) : formatInrAmount(value);
}

/** "Added ₹250 · Swiggy": the card's confirmation and the widget's status line. */
export function addedText(
  amount: string | number,
  name: string | null | undefined,
  type: "debit" | "credit" = "debit",
): string {
  const label = name?.trim() || (type === "credit" ? "Income" : "Expense");
  return `Added ${formatAmount(Math.abs(Number(amount)))} · ${label}`;
}

/** "0:04": the recording timer. */
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
