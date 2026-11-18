import * as z from 'zod';

import { decimalInput, decimalToCents, quantizeMoney } from '../../core/decimal';
import { unprocessable, uuidString } from '../../core/validation';
import type { CategoryScope } from '../categories/schemas';

const TRANSACTION_TYPES = ['debit', 'credit'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** How a row counts: the one field that decides it (`counterparty_type` is only descriptive). `type` stays the direction. */
export const TRANSACTION_KINDS = ['spend', 'income', 'transfer', 'payback'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** `spend` is a debit; `income` and `payback` are credits; `transfer` is either. */
export function kindFitsType(kind: TransactionKind, type: TransactionType): boolean {
  if (kind === 'transfer') return true;
  return kind === 'spend' ? type === 'debit' : type === 'credit';
}

/** The kind a row gets when nobody chose one: an own-account transfer is a transfer, otherwise the direction decides. */
export function defaultKind(type: TransactionType, counterpartyType: string | null | undefined): TransactionKind {
  if (counterpartyType === 'self_transfer') return 'transfer';
  return type === 'debit' ? 'spend' : 'income';
}

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

/** Nothing the app records is older than this (the transaction's instant). */
export const MIN_TRANSACTION_AT_MS = Date.UTC(2000, 0, 1);
/**
 * A new transaction may be dated at most this far ahead of the server clock: a device clock that runs fast or a zone ahead should
 * not lose an entry, a typo years ahead should.
 */
export const MAX_TRANSACTION_AHEAD_MS = 2 * 86_400_000;
const FUTURE_MESSAGE = 'transaction_at cannot be more than 2 days in the future';

/** Fails (422 `value_error`, like a schema issue) when `ms` is further ahead than a new transaction may be. */
export function assertNotTooFarAhead(ms: number): void {
  if (ms > Date.now() + MAX_TRANSACTION_AHEAD_MS) unprocessable([{ type: 'value_error', loc: ['body', 'transaction_at'], msg: FUTURE_MESSAGE }]);
}

/** `datetimeInput` for a transaction's time: not before 2000-01-01 (422 like any invalid field). */
const boundedInstant = datetimeInput.superRefine((instant, ctx) => {
  if (instant.ms < MIN_TRANSACTION_AT_MS) ctx.addIssue({ code: 'custom', message: 'transaction_at cannot be before 2000-01-01', params: { type: 'value_error' } });
});

/** A new entry's time: also not more than 2 days ahead. */
export const transactionAtInput = boundedInstant.superRefine((instant, ctx) => {
  if (instant.ms <= Date.now() + MAX_TRANSACTION_AHEAD_MS) return;
  ctx.addIssue({ code: 'custom', message: FUTURE_MESSAGE, params: { type: 'value_error' } });
});

/**
 * An edit's time. The future bound is applied by the service only when the instant CHANGES: a client echoing back the stored time
 * of a row dated ahead (a bill due next week, a clock-skewed capture) must still be able to save its other edits.
 */
const transactionAtPatchInput = boundedInstant;

/* ----------------------------------------------------------------------------------------------
 * Request bodies (POST / PATCH share one shape, like Python's TransactionCreate / TransactionUpdate)
 * -------------------------------------------------------------------------------------------- */

/** The largest amount one transaction (or reminder, recurring item, payback) can hold: Rs 1,00,00,000.00, in cents. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

/**
 * Money in rupees: greater than 0, at most Rs 1,00,00,000.00 and at most two decimals (a third decimal is refused, never rounded:
 * what the user typed is what is stored). The parsed value is a canonical two-decimal string.
 */
export const amountInput = z.preprocess(
  snapToCent,
  decimalInput({ positive: true, maxDecimalPlaces: 2 }).transform((canonical, ctx): string => {
    const money = quantizeMoney(canonical); // exact: no more than two places reach this point
    if (decimalToCents(money) > MAX_AMOUNT_CENTS) {
      ctx.addIssue({ code: 'custom', message: 'Input should be less than or equal to 10000000', params: { type: 'less_than_equal' } });
      return z.NEVER;
    }
    return money;
  }),
);

/** How close (in cents) a value must be to a whole cent to be float noise rather than a real third decimal. */
const FLOAT_NOISE_CENTS = 1e-6;

/**
 * App 1.5.0 builds amounts as JS floats (`100.30000000000001`): a value within a millionth of a cent of a whole cent is that noise
 * and is rounded to the cent. A real third decimal (`12.505`) is not near one and is still refused by `decimalInput`.
 */
function snapToCent(raw: unknown): unknown {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\+?\d+\.\d{3,}$/.test(text)) return raw;
  const cents = Number(text) * 100;
  const nearest = Math.round(cents);
  return Math.abs(cents - nearest) <= FLOAT_NOISE_CENTS ? (nearest / 100).toFixed(2) : raw;
}

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

const bodyFields = {
  amount: amountInput,
  type: z.enum(TRANSACTION_TYPES),
  counterparty_name: z
    .string()
    .min(1)
    .max(200)
    .transform((s) => s.trim()),
  counterparty_type: counterpartyType,
  /** How the row counts; omitted = derived from the direction and the counterparty (old app builds never send it). */
  kind: z.enum(TRANSACTION_KINDS).optional(),
  category: trimmedOrNull(120),
  category_id: uuidString.nullish(),
  /** A catalogue brand the user picked; unknown ids are ignored and the brand is resolved from the name. */
  brand_id: z.string().max(64).nullish(),
  note: trimmedOrNull(2000),
  transaction_at: transactionAtInput,
};
const patchFields = { ...bodyFields, transaction_at: transactionAtPatchInput };

/**
 * `merchant` is the legacy alias of `counterparty_name`. Unknown keys (`detected_via`, `receipt_url`,
 * `voice_url`, `user_id`, ...) are dropped: they are server-only fields (S7) and never read from clients.
 */
const withMerchantAlias = <T extends z.ZodType>(shape: T) =>
  z.preprocess((raw) => {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const o = raw as Record<string, unknown>;
      if (o['counterparty_name'] === undefined && o['merchant'] !== undefined) {
        return { ...o, counterparty_name: o['merchant'] };
      }
    }
    return raw;
  }, shape);

/** `POST /transactions`: every field of the entry. */
export const transactionWriteSchema = withMerchantAlias(z.object(bodyFields));
export type TransactionWriteBody = z.output<typeof transactionWriteSchema>;

/**
 * `PATCH /transactions/:id`: only the fields sent change (an omitted field keeps its value; `null` clears `category`, `category_id`,
 * `note`). `expected_updated_at` (the `updated_at` the client last saw) turns a change made elsewhere meanwhile into a 409 `stale`.
 * An app build that sends the whole entry keeps working: it simply sets every field.
 */
export const transactionPatchSchema = withMerchantAlias(z.object(patchFields).partial().extend({ expected_updated_at: datetimeInput.optional() }));
export type TransactionPatchBody = z.output<typeof transactionPatchSchema>;

/** `DELETE /transactions/:id` (query or JSON body) and `POST .../restore`: the optional staleness guard. */
export const expectedUpdatedAtSchema = z.object({ expected_updated_at: datetimeInput.optional() });

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
  /** Only the transactions a recurring item posted (its history; archived items too). */
  recurring_item_id: z.preprocess((v) => (v === '' ? undefined : v), uuidString.optional()),
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
  kind: TransactionKind;
  /** The row's calendar day / month in the user's timezone (`YYYY-MM-DD` / `YYYY-MM`); null until the backfill reaches it. */
  local_date?: string | null;
  month_key?: string | null;
  /** 1 = a capture the user should look at (possible duplicate). */
  needs_review?: number;
  /** The recurring item that posted this row; null for everything else. */
  recurring_item_id?: string | null;
  /** The period (its due date, `YYYY-MM-DD`) a recurring posting stands for: its identity together with `recurring_item_id`. */
  recurring_occurrence?: string | null;
  /** Catalogue brand (`brands.id`); null for people, local shops and unmatched names. */
  brand_id?: string | null;
}

export const LIST_COLUMNS =
  'id,user_id,amount,type,kind,counterparty_name,counterparty_type,counterparty_normalized,category_id,note,detected_via,receipt_url,voice_url,transaction_at,created_at,updated_at,recurring_item_id,brand_id,local_date,month_key,needs_review';
export const DETAIL_COLUMNS = `${LIST_COLUMNS},deleted_at,payment_hash,recurring_occurrence`;

export interface TransactionResponse {
  id: string;
  user_id: string;
  amount: string;
  type: TransactionType;
  /** How the row counts: spend, income, transfer (in neither) or payback (a refund / reimbursement). */
  kind: TransactionKind;
  /** Sum of the paybacks linked to this row (a debit's reimbursements, or the part of a credit already linked to a debit). */
  offset_total: string;
  /** `amount` minus `offset_total`: what is left to count (a debit's real cost, a credit's unlinked part). */
  effective_amount: string;
  needs_review: boolean;
  counterparty_name: string | null;
  counterparty_type: CounterpartyType;
  counterparty_normalized: string | null;
  merchant: string;
  category: string | null;
  category_id: string | null;
  category_icon_name: string | null;
  category_color: string | null;
  /** Scope of the category: `recurring_*` marks fixed money. Null without a category. */
  category_scope: CategoryScope | null;
  /** The recurring item that posted this row; null for everything else. */
  recurring_item_id: string | null;
  /** Catalogue brand this was paid to / received from (`brands.id`), or null. */
  brand_id: string | null;
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
  /** Part of `debit_total` / `credit_total` in recurring (fixed) categories. */
  fixed_debit_total: string;
  fixed_credit_total: string;
  net: string;
  transaction_count: number;
}

export interface TransactionListResponse {
  items: TransactionResponse[];
  has_more: boolean;
  day_summaries: Record<string, DayTransactionSummary>;
}

export interface MonthSummaryResponse extends BudgetPicture {
  credit_total: string;
  debit_total: string;
  net: string;
  transaction_count: number;
  /** Fixed = in a recurring category (fixed spend / fixed income); flexible = everything else. */
  fixed_debit_total: string;
  flexible_debit_total: string;
  fixed_credit_total: string;
  flexible_credit_total: string;
  debit_by_category: Record<string, string>;
  /** Display fields of the categories in `debit_by_category` (any scope); absent ids are unknown to the user. */
  category_meta: { id: string; name: string; icon_name: string | null; color: string | null; scope: CategoryScope }[];
}

/**
 * Additive fields of the month views (home, month summary), all from the one ledger definition (`ledger.ts`): the month's
 * budget picture so the app stops re-deriving it. `budget_left` is signed (negative = over budget).
 */
export interface BudgetPicture {
  /** Spend that counts toward the monthly budget: flexible spend plus recurring items that opted in, net of paybacks. */
  budget_spent: string;
  /** `monthly_budget - budget_spent`; null when the month has no cap. */
  budget_left: string | null;
  /** Fixed spend not counted in the budget (rent, EMI, insurance). */
  committed_total: string;
  /** Own-account, ATM and card-bill movements: in neither spent nor income. */
  transfer_total: string;
  /** Money paid back that reduced this month's spend (linked reimbursements plus unlinked refunds). */
  payback_total: string;
  /** The cap in force for the month (from the budget history); null when none. */
  monthly_budget: string | null;
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

export interface HomeOverviewResponse extends BudgetPicture {
  spent_today: string;
  spent_this_month: string;
  fixed_spent_this_month: string;
  flexible_spent_this_month: string;
  /** Everyday spending categories only (recurring ones are fixed, shown separately). */
  top_categories: TopCategoryRow[];
  recent_transactions: TransactionResponse[];
  last_7_days_spend: DailySpendRow[];
}
