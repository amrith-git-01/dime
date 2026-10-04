/** Money formatting for the agent: Indian digit grouping, and money fields that carry both forms. */

/** "1,23,456" from a digit string: the last three digits, then groups of two. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${digits.slice(-3)}`;
}

/** "₹1,23,456" / "₹1,23,456.50" (whole amounts drop ".00"); negative values keep a leading "-". */
export function formatInr(value: number): string {
  const cents = Math.round(Math.abs(value) * 100);
  const whole = groupIndian(String(Math.floor(cents / 100)));
  const frac = cents % 100;
  return `${value < 0 && cents > 0 ? '-' : ''}₹${whole}${frac === 0 ? '' : `.${String(frac).padStart(2, '0')}`}`;
}

const isNumeric = (v: unknown): v is number | string =>
  typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v);

/**
 * Money fields (by key) become a decimal string `"1234.50"` plus a sibling `<key>_display` ("₹1,234.50"),
 * so the model can quote an amount verbatim and never format or compute one. Arrays under `skipArrays`
 * (long per-day series) are left as plain numbers to save tokens.
 */
export function withMoneyDisplay(value: unknown, moneyKeys: ReadonlySet<string>, skipArrays: ReadonlySet<string> = new Set()): unknown {
  if (Array.isArray(value)) return value.map((v) => withMoneyDisplay(v, moneyKeys, skipArrays));
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (moneyKeys.has(key) && isNumeric(v)) {
      const n = Number(v);
      out[key] = n.toFixed(2);
      out[`${key}_display`] = formatInr(n);
    } else if (skipArrays.has(key)) {
      out[key] = v;
    } else {
      out[key] = withMoneyDisplay(v, moneyKeys, skipArrays);
    }
  }
  return out;
}
