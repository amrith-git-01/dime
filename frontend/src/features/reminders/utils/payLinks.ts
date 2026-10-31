import { paiseToAmountString, toPaise } from "@/utils/paise";

import { UPI_ID_PATTERN } from "../constants";

/** `am` bounds of the pay page, in paise: 0.01 to 1,000,000. */
const MIN_PAISE = 1;
const MAX_PAISE = 100_000_000;
const MAX_NAME_CHARS = 40;
const MAX_NOTE_CHARS = 80;

/**
 * Letters and digits of any script need Unicode property escapes. Hermes may not have them, so the
 * pattern is built at run time and falls back to ASCII instead of failing when the bundle loads.
 */
function disallowedChars(unicodeSet: string, asciiSet: string): RegExp {
  try {
    return new RegExp(`[^${unicodeSet}]`, "gu");
  } catch {
    return new RegExp(`[^${asciiSet}]`, "g");
  }
}

// The pay page's allow-lists (api/src/features/reminders/pay.ts): anything else makes it refuse the link.
const NAME_DISALLOWED = disallowedChars("\\p{L}\\p{N} .\\-", "A-Za-z0-9 .\\-");
const NOTE_DISALLOWED = disallowedChars(
  "\\p{L}\\p{N} .,\\-_'#&()/:@!?%+*",
  "A-Za-z0-9 .,\\-_'#&()/:@!?%+*",
);
/** The page refuses a payee name that poses as the app. */
const IMPERSONATION = /dime/i;

function clean(text: string, disallowed: RegExp, maxChars: number): string | null {
  const stripped = text
    .replace(/\s+/g, " ")
    .replace(disallowed, "")
    .replace(/ {2,}/g, " ")
    .trim();
  // By characters, not UTF-16 units: the page counts characters.
  const value = Array.from(stripped).slice(0, maxChars).join("").trim();
  return value.length > 0 ? value : null;
}

/** A payee name the pay page accepts (letters, digits, space, dot, dash; at most 40), else null. */
export function sanitizePayName(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }
  const value = clean(name, NAME_DISALLOWED, MAX_NAME_CHARS);
  return value !== null && !IMPERSONATION.test(value) ? value : null;
}

/** A payment note the pay page accepts (limited punctuation, at most 80), else null. */
export function sanitizePayNote(note: string | null | undefined): string | null {
  return note ? clean(note, NOTE_DISALLOWED, MAX_NOTE_CHARS) : null;
}

/** The amount as `500.00` when it is a real payable amount (0.01 to 1,000,000), else null. */
export function normalizePayAmount(
  amount: string | number | null | undefined,
): string | null {
  if (amount === null || amount === undefined || amount === "") {
    return null;
  }
  const paise = toPaise(amount);
  return paise >= MIN_PAISE && paise <= MAX_PAISE ? paiseToAmountString(paise) : null;
}

/** What the limit reads as in a hint (Indian digit grouping). */
export const PAY_LIMIT_LABEL = "\u20b910,00,000";

/** True when an amount is valid but above what the pay page and Pay now can carry. */
export function exceedsPayLimit(amount: string | number | null | undefined): boolean {
  if (amount === null || amount === undefined || amount === "") {
    return false;
  }
  return toPaise(amount) > MAX_PAISE;
}

export type PayParts = {
  upiId: string;
  name?: string | null;
  amount?: string | number | null;
  note?: string | null;
};

type Query = { pa: string; pn: string | null; am: string | null; tn: string | null };

/** Valid, sanitized link parts; null when the UPI id is invalid or an amount is given but unusable. */
function payQuery(parts: PayParts): Query | null {
  const pa = parts.upiId.trim();
  if (!UPI_ID_PATTERN.test(pa)) {
    return null;
  }
  const hasAmount =
    parts.amount !== null && parts.amount !== undefined && parts.amount !== "";
  const am = normalizePayAmount(parts.amount);
  if (hasAmount && am === null) {
    return null;
  }
  return {
    pa,
    pn: sanitizePayName(parts.name),
    am,
    tn: sanitizePayNote(parts.note),
  };
}

const encode = (value: string): string => encodeURIComponent(value);

function queryString(query: Query, upi: boolean): string {
  // The UPI id keeps its "@": UPI apps and chat apps expect it.
  const parts = [`pa=${encode(query.pa).replace(/%40/g, "@")}`];
  if (query.pn) {
    parts.push(`pn=${encode(query.pn)}`);
  }
  if (query.am) {
    parts.push(`am=${query.am}`);
  }
  if (upi) {
    parts.push("cu=INR");
  }
  if (query.tn) {
    parts.push(`tn=${encode(query.tn)}`);
  }
  return parts.join("&");
}

/**
 * The https page that opens the payer's UPI app (chat apps do not link `upi://` addresses). Null when
 * the UPI id or amount is invalid or there is no API origin (origin only: no `/api/v1`).
 */
export function buildPayLink(
  parts: PayParts & { apiOrigin: string | null | undefined },
): string | null {
  const origin = parts.apiOrigin?.trim().replace(/\/+$/, "") ?? "";
  if (!/^https?:\/\/[^/\s]+$/i.test(origin)) {
    return null;
  }
  const query = payQuery(parts);
  return query ? `${origin}/pay?${queryString(query, false)}` : null;
}

/** The `upi://pay` address that "Pay now" opens directly. Null when the UPI id or amount is invalid. */
export function buildUpiUri(parts: PayParts): string | null {
  const query = payQuery(parts);
  return query ? `upi://pay?${queryString(query, true)}` : null;
}
