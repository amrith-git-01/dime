/** Integer-paise helpers so money is summed exactly instead of as binary floats. */

const AMOUNT_INPUT_PATTERN = /^(\d+(\.\d{1,2})?|\.\d{1,2})$/;

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

/** Strictly parse typed amount text (optional commas, max 2 decimals) to positive paise, else null. */
export function parseAmountInputToPaise(raw: string): number | null {
  const normalized = raw.replace(/,/g, "").trim();
  if (!AMOUNT_INPUT_PATTERN.test(normalized)) {
    return null;
  }
  const [whole = "", fraction = ""] = normalized.split(".");
  const paise = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

/** Format integer paise as a decimal string such as `"250.50"`. */
export function paiseToAmountString(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const fraction = String(Math.abs(paise % 100)).padStart(2, "0");
  return `${whole}.${fraction}`;
}
