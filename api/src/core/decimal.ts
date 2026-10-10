import * as z from 'zod';

/**
 * Decimal request fields, behaving like Pydantic's `Decimal` (contract C6: the client sends decimal
 * strings, numbers are accepted too). The parsed value is a canonical decimal string (no exponent,
 * no leading zeros, no trailing fractional zeros) that is safe to convert to integer cents (`toCents`).
 */
export interface DecimalOptions {
  /** Value must be > 0 instead of >= 0. */
  positive?: boolean;
  /** Pydantic `max_digits - decimal_places`: whole digits allowed (default `DEFAULT_MAX_WHOLE_DIGITS`, so money stays inside a safe integer in cents). */
  maxWholeDigits?: number;
  maxDecimalPlaces?: number;
}

/** Every money field takes at most 10 whole digits. */
export const DEFAULT_MAX_WHOLE_DIGITS = 10;

const DECIMAL_RE = /^([+-]?)(\d*)(?:\.(\d*))?$/;

function fail(ctx: z.RefinementCtx, type: string, message: string): typeof z.NEVER {
  ctx.addIssue({ code: 'custom', message, params: { type } });
  return z.NEVER;
}

export function decimalInput(options: DecimalOptions = {}) {
  return z.union([z.number(), z.string()]).transform((raw, ctx): string => {
    const text = typeof raw === 'number' ? (Number.isFinite(raw) ? String(raw) : 'NaN') : raw.trim();
    const m = DECIMAL_RE.exec(text);
    if (!m || ((m[2] ?? '') === '' && (m[3] ?? '') === '')) {
      return fail(ctx, 'decimal_parsing', 'Input should be a valid decimal');
    }
    const whole = (m[2] ?? '').replace(/^0+/, '');
    const fraction = (m[3] ?? '').replace(/0+$/, '');
    const isZero = whole === '' && fraction === '';
    if (m[1] === '-' && !isZero) {
      return options.positive
        ? fail(ctx, 'greater_than', 'Input should be greater than 0')
        : fail(ctx, 'greater_than_equal', 'Input should be greater than or equal to 0');
    }
    if (isZero && options.positive) return fail(ctx, 'greater_than', 'Input should be greater than 0');
    const maxPlaces = options.maxDecimalPlaces;
    if (maxPlaces !== undefined && fraction.length > maxPlaces) {
      return fail(
        ctx,
        'decimal_max_places',
        `Decimal input should have no more than ${maxPlaces} decimal place${maxPlaces === 1 ? '' : 's'}`,
      );
    }
    const maxWhole = options.maxWholeDigits ?? DEFAULT_MAX_WHOLE_DIGITS;
    if (whole.length > maxWhole) {
      return fail(
        ctx,
        'decimal_whole_digits',
        `Decimal input should have no more than ${maxWhole} digit${maxWhole === 1 ? '' : 's'} before the decimal point`,
      );
    }
    return `${whole || '0'}${fraction ? `.${fraction}` : ''}`;
  });
}

/**
 * Money as a 2-decimal string ("5000.00") from a decimal number or string. Python printed whatever float repr it had parsed ("5000.0"); a fixed scale is
 * the stable shape that the client's `Number(...)` parsing expects.
 */
export function formatMoney(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

/**
 * Python `Decimal.quantize(Decimal("0.01"))` (ROUND_HALF_EVEN) on a canonical decimal string such as
 * the output of `decimalInput`. Returns a plain "123.45" string, exact for any length.
 */
export function quantizeMoney(canonical: string): string {
  const negative = canonical.startsWith('-');
  const [wholeRaw = '0', fraction = ''] = (negative ? canonical.slice(1) : canonical).split('.');
  const kept = fraction.slice(0, 2).padEnd(2, '0');
  const rest = fraction.slice(2);
  let cents = BigInt(`${wholeRaw || '0'}${kept}`);
  if (rest !== '') {
    const first = rest.charCodeAt(0) - 48;
    const tail = /[1-9]/.test(rest.slice(1));
    if (first > 5 || (first === 5 && (tail || cents % 2n === 1n))) cents += 1n;
  }
  const s = cents.toString().padStart(3, '0');
  return `${negative && cents !== 0n ? '-' : ''}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Integer cents from a DB `numeric` (JSON number or string). Money columns have two decimals, so this is exact. */
export function toCents(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** "-135.00" from integer cents. */
export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${whole}.${frac}`;
}

/**
 * Integer cents from a decimal string or number to be stored in a D1 money column. Exact for strings
 * (half-even at the third decimal, like `quantizeMoney`); throws on text that is not a decimal.
 */
export function decimalToCents(value: string | number): number {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) throw new TypeError(`Not a decimal amount: '${text}'`);
  return Number(quantizeMoney(text.replace(/^\+/, '')).replace('.', ''));
}
