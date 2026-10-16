import { formatInrAmount, formatInrCompact } from "@/utils/currency";

export const READING_RECEIPT_TEXT = "Reading receipt…";
export const READING_VOICE_TEXT = "Reading voice note…";
export const STILL_READING_TEXT = "Still reading. We'll update the widget";
export const CAPTURE_FAILED_TEXT = "Couldn't read that. Try again or add it by hand";

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
