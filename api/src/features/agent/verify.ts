/**
 * Numeric verification of an answer against the tool results.
 *
 * Every figure that matters in the answer (amounts with ₹ / Rs / INR, lakh / crore / k shorthand,
 * percentages, other numbers of 1,000 or more) must be one of the numbers the tools returned, with
 * formatting tolerance: commas of either grouping, ₹, a rounding to whole rupees, and shorthand rounded
 * to its displayed precision ("₹1.2 lakh"). Years, days of the month and small counts are not checked.
 */

export interface Mention {
  /** The text as written (trimmed). */
  raw: string;
  /** Numeric value after shorthand multipliers. */
  value: number;
  /** Digits after the decimal point as written. */
  decimals: number;
  /** Multiplier of lakh / crore / k shorthand (1 when none). */
  multiplier: number;
  percent: boolean;
  currency: boolean;
  /** Worth checking against the tool results. */
  checked: boolean;
}

const TOKEN_RE = /(₹|\brs\.?|\binr\b)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(lakhs?|lacs?|crores?|cr\b|k\b|%))?/gi;

const MULTIPLIERS: Record<string, number> = { lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, crore: 1e7, crores: 1e7, cr: 1e7, k: 1e3 };

/** Every number in `text`; `checked` marks the ones the verifier compares (the evals read them all). */
export function extractMentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const match of text.matchAll(TOKEN_RE)) {
    const digits = match[2] ?? '';
    const suffix = (match[3] ?? '').toLowerCase();
    const currency = Boolean(match[1]);
    const percent = suffix === '%';
    const multiplier = MULTIPLIERS[suffix] ?? 1;
    const base = Number(digits.replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    const decimals = digits.includes('.') ? (digits.split('.')[1] ?? '').length : 0;
    const isYear = !digits.includes(',') && decimals === 0 && base >= 1900 && base <= 2100;
    const checked = currency || percent || multiplier > 1 || (!isYear && (base >= 1000 || digits.includes(',')));
    out.push({ raw: match[0].trim(), value: base * multiplier, decimals, multiplier, percent, currency, checked });
  }
  return out;
}

/** Whether `value` equals the mention up to what its formatting could have rounded away. */
export function mentionMatches(mention: Pick<Mention, 'value' | 'decimals' | 'multiplier'>, value: number): boolean {
  const tolerance =
    mention.multiplier > 1 ? 0.5 * 10 ** -mention.decimals * mention.multiplier + 1e-6 : mention.decimals > 0 ? 0.5 * 10 ** -mention.decimals + 1e-9 : 1;
  const diff = Math.abs(Math.abs(value) - mention.value);
  return mention.decimals === 0 && mention.multiplier === 1 ? diff < tolerance : diff <= tolerance;
}

const NUMBER_IN_TEXT = /\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Every number inside a JSON value: numbers, numeric strings and numbers written inside strings ("₹1,234.50"). */
export function numbersIn(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out.push(Math.abs(value));
  } else if (typeof value === 'string') {
    for (const m of value.match(NUMBER_IN_TEXT) ?? []) out.push(Number(m.replace(/,/g, '')));
  } else if (Array.isArray(value)) {
    for (const v of value) numbersIn(v, out);
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) numbersIn(v, out);
  }
  return out;
}

export interface Verification {
  ok: boolean;
  /** The figures of the answer no tool result backs. */
  unmatched: string[];
}

export function verifyAnswer(answer: string, allowed: readonly number[]): Verification {
  const unmatched: string[] = [];
  for (const mention of extractMentions(answer)) {
    if (!mention.checked) continue;
    if (!allowed.some((a) => mentionMatches(mention, a))) unmatched.push(mention.raw);
  }
  return { ok: unmatched.length === 0, unmatched };
}
