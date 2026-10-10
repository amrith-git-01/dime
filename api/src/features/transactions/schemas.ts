import * as z from 'zod';

import { decimalInput, quantizeMoney } from '../../core/decimal';
import { uuidString } from '../../core/validation';

const TRANSACTION_TYPES = ['debit', 'credit'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

const COUNTERPARTY_TYPES = ['merchant', 'person', 'self_transfer', 'unknown'] as const;
export type CounterpartyType = (typeof COUNTERPARTY_TYPES)[number];
const COUNTERPARTY_SET: ReadonlySet<string> = new Set(COUNTERPARTY_TYPES);

/* ----------------------------------------------------------------------------------------------
 * Datetimes
 * -------------------------------------------------------------------------------------------- */

export interface Instant {
  ms: number;
  /** Canonical ISO-8601 UTC (`2026-10-04T10:00:00.000Z`) for SQL filters and writes. */
  iso: string;
}

const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/**
 * Parse what Pydantic's `datetime` accepts in practice: ISO-8601 date or date-time with optional
 * `Z` / `+hh:mm` offset, or a Unix timestamp (seconds, or milliseconds when above 2e10). A value
 * without an offset is taken as UTC (the DB session timezone, same as the Python backend).
 */
export function parseDatetime(raw: string | number): Instant | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const ms = Math.abs(raw) > 2e10 ? raw : raw * 1000;
    return Number.isNaN(new Date(ms).getTime()) ? null : { ms, iso: new Date(ms).toISOString() };
  }
  // A literal `+` in a query string arrives as a space (only before an offset, never inside the date).
  const text = raw.trim().replace(/(\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?) (\d{2}(?::?\d{2})?)$/, '$1+$2');
  if (/^-?\d+(\.\d+)?$/.test(text)) return parseDatetime(Number(text));
  const m = DATETIME_RE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', frac = '', zone] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const local = Date.UTC(year, month - 1, day, hour, minute, second, Number(frac.padEnd(3, '0').slice(0, 3)));
  const check = new Date(local);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  let offsetMinutes = 0;
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0'));
  }
  const ms = local - offsetMinutes * 60_000;
  return { ms, iso: new Date(ms).toISOString() };
}

const INVALID_DATETIME = 'Input should be a valid datetime or date';

/** Required datetime field/param; `datetime_parsing` 422 like FastAPI. */
export const datetimeInput = z.union([z.string().max(64), z.number()]).transform((raw, ctx): Instant => {
  const parsed = parseDatetime(raw);
  if (!parsed) {
    ctx.addIssue({ code: 'custom', message: INVALID_DATETIME, params: { type: 'datetime_parsing' } });
    return z.NEVER;
  }
  return parsed;
});

/* ----------------------------------------------------------------------------------------------
 * Request bodies (POST / PATCH share one shape, like Python's TransactionCreate / TransactionUpdate)
 * -------------------------------------------------------------------------------------------- */

export const amountInput = decimalInput({ positive: true }).transform((canonical, ctx): string => {
  // Pydantic validates `gt=0` first and quantizes to cents afterwards; a value that rounds to zero
  // would violate the column's positive-amount intent, so reject it instead of storing 0.00.
  const cents = quantizeMoney(canonical);
  if (cents === '0.00') {
    ctx.addIssue({ code: 'custom', message: 'Input should be greater than 0', params: { type: 'greater_than' } });
    return z.NEVER;
  }
  return cents;
});

/** `counterparty_type`: anything unknown becomes null instead of an error. */
const counterpartyType = z
  .unknown()
  .transform((v): CounterpartyType | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return COUNTERPARTY_SET.has(s) ? (s as CounterpartyType) : null;
  })
  .optional();

/** `category` / `note`: trimmed, blank or non-string becomes null; max length applies after trimming. */
const trimmedOrNull = (max: number) =>
  z
    .preprocess((v) => (typeof v === 'string' ? v.trim() || null : null), z.string().max(max).nullable())
    .optional();

const bodyShape = z.object({
  amount: amountInput,
  type: z.enum(TRANSACTION_TYPES),
  counterparty_name: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.trim()),
  counterparty_type: counterpartyType,
  category: trimmedOrNull(120),
  category_id: uuidString.nullish(),
  note: trimmedOrNull(2000),
  transaction_at: datetimeInput,
});

/**
 * `merchant` is the legacy alias of `counterparty_name`. Unknown keys (`detected_via`, `receipt_url`,
 * `voice_url`, `user_id`, ...) are dropped: they are server-only fields (S7) and never read from clients.
 */
export const transactionWriteSchema = z.preprocess((raw) => {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o['counterparty_name'] === undefined && o['merchant'] !== undefined) {
      return { ...o, counterparty_name: o['merchant'] };
    }
  }
  return raw;
}, bodyShape);
export type TransactionWriteBody = z.output<typeof transactionWriteSchema>;

/* ----------------------------------------------------------------------------------------------
 * Query / path parameters
 * -------------------------------------------------------------------------------------------- */

const timezoneParam = z.string().min(2).max(80);

export const timezoneQuerySchema = z.object({ timezone: timezoneParam });

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  timezone: timezoneParam,
});

export const listQuerySchema = z.object({
  from: datetimeInput.optional(),
  to: datetimeInput.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  timezone: timezoneParam.optional(),
  /** C3 */
  category_id: z.preprocess((v) => (v === '' ? undefined : v), uuidString.optional()),
  /** C3: case-insensitive "contains" on the payee (normalized key or name). */
  payee: z.string().max(200).optional(),
});
export type ListQuery = z.output<typeof listQuerySchema>;

export const idParamSchema = z.object({ id: uuidString });

/* ----------------------------------------------------------------------------------------------
 * Rows and responses
 * -------------------------------------------------------------------------------------------- */

export interface TransactionRow {
  id: string;
  user_id: string;
  amount: number | string;
  type: TransactionType;
  counterparty_name: string | null;
  counterparty_type: string | null;
  counterparty_normalized: string | null;
  category_id: string | null;
  note: string | null;
  detected_via: string | null;
  receipt_url: string | null;
  voice_url: string | null;
  transaction_at: string;
  created_at: string;
  updated_at: string | null;
  deleted_at?: string | null;
  payment_hash?: string | null;
}

export const LIST_COLUMNS =
  'id,user_id,amount,type,counterparty_name,counterparty_type,counterparty_normalized,category_id,note,detected_via,receipt_url,voice_url,transaction_at,created_at,updated_at';
export const DETAIL_COLUMNS = `${LIST_COLUMNS},deleted_at,payment_hash`;

export interface TransactionResponse {
  id: string;
  user_id: string;
  amount: string;
  type: TransactionType;
  counterparty_name: string | null;
  counterparty_type: CounterpartyType;
  counterparty_normalized: string | null;
  merchant: string;
  category: string | null;
  category_id: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  note: string | null;
  detected_via: string | null;
  transaction_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  receipt_url: string | null;
  voice_url: string | null;
  payment_hash: string | null;
}

export interface DayTransactionSummary {
  date: string;
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
}

export interface TransactionListResponse {
  items: TransactionResponse[];
  has_more: boolean;
  day_summaries: Record<string, DayTransactionSummary>;
}

export interface MonthSummaryResponse {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
  debit_by_category: Record<string, string>;
}

export interface TopCategoryRow {
  category_id: string | null;
  name: string;
  icon_name: string | null;
  color: string | null;
  total: string;
}

interface DailySpendRow {
  date: string;
  total: string;
}

export interface HomeOverviewResponse {
  spent_today: string;
  spent_this_month: string;
  top_categories: TopCategoryRow[];
  recent_transactions: TransactionResponse[];
  last_7_days_spend: DailySpendRow[];
}
