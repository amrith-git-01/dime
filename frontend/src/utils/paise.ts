/** Integer-paise helpers so money is summed exactly instead of as binary floats. */

const AMOUNT_INPUT_PATTERN = /^(\d+(\.\d{1,2})?|\.\d{1,2})$/;

/** The API refuses a transaction, reminder, recurring item or payback above Rs 1,00,00,000.00. */
export const MAX_AMOUNT_PAISE = 1_000_000_000;

/** Convert an API decimal string (or number) to integer paise; non-finite input is 0. */
export function toPaise(value: string | number | undefined | null): number {
  if (value === undefined || value === null) {
    return 0;
  }
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Strictly parse typed amount text (optional commas, max 2 decimals) to positive paise no larger than the API
 * accepts, else null. The one parser every money field uses: a third decimal or a letter is refused, never rounded.
 */
export function parseAmountInputToPaise(raw: string): number | null {
  const normalized = raw.replace(/,/g, "").trim();
  if (!AMOUNT_INPUT_PATTERN.test(normalized)) {
    return null;
  }
  const [whole = "", fraction = ""] = normalized.split(".");
  const paise = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 && paise <= MAX_AMOUNT_PAISE ? paise : null;
}

/** What a form says under an amount that is well formed but above the API's limit. */
export const AMOUNT_TOO_LARGE_MESSAGE = "Amount can be at most ₹1,00,00,000.";

/** True when the text is a well-formed amount that is only too large (so a form can say so instead of "enter an amount"). */
export function isAmountAboveMax(raw: string): boolean {
  const normalized = raw.replace(/,/g, "").trim();
  if (!AMOUNT_INPUT_PATTERN.test(normalized)) {
    return false;
  }
  const [whole = "", fraction = ""] = normalized.split(".");
  return Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0")) > MAX_AMOUNT_PAISE;
}

/** `parseAmountInputToPaise` in rupees (for sliders and caps that hold rupee numbers), else null. */
export function parseAmountInputToRupees(raw: string): number | null {
  const paise = parseAmountInputToPaise(raw);
  return paise === null ? null : paise / 100;
}

/** Format integer paise as a decimal string such as `"250.50"`. */
export function paiseToAmountString(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const fraction = String(Math.abs(paise % 100)).padStart(2, "0");
  return `${whole}.${fraction}`;
}
