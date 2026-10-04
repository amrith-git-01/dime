import { toCents } from '../../core/decimal';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import { normalizeCounterparty } from './dedupe';
import { parsePeriodSummary } from './aggregates';
import type { AmountTypeAtRow, AmountTypeCategoryRow, DayTotals, PeriodSummary } from './aggregates';
import { DETAIL_COLUMNS, LIST_COLUMNS } from './schemas';
import type { TransactionRow } from './schemas';

/** Rows per request when a fallback has to page through a range (PostgREST caps responses at 1000). */
const PAGE_SIZE = 1000;

export interface ListFilters {
  /** Inclusive lower bound (ISO). */
  from?: string | undefined;
  /** Exclusive upper bound (ISO). */
  to?: string | undefined;
  categoryId?: string | undefined;
  payee?: string | undefined;
}

/**
 * PostgREST `or` expression for the C3 payee filter: case-insensitive "contains" on the normalized
 * payee and on the display name (rows without a normalized value). Reserved filter characters are
 * stripped (`" \ * %`) and the value is double-quoted so `, ( ) .` stay literal; over-matching is
 * acceptable because the client re-applies the exact match.
 */
export function payeeOrFilter(payee: string): string | null {
  const clean = payee.replace(/[\\"*%]/g, '').trim().slice(0, 100);
  if (!clean) return null;
  const parts = [`counterparty_normalized.ilike."*${clean}*"`, `counterparty_name.ilike."*${clean}*"`];
  const normalized = normalizeCounterparty(clean);
  if (normalized && normalized !== clean.toLowerCase()) parts.push(`counterparty_normalized.ilike."*${normalized}*"`);
  return parts.join(',');
}

/** Up to `limit` rows (callers ask for one extra to learn whether more exist), newest first. */
export async function listPage(
  db: DimeSupabaseClient,
  userId: string,
  opts: { filters: ListFilters; limit: number; offset: number },
): Promise<TransactionRow[]> {
  const { filters } = opts;
  let q = db.from('transactions').select(LIST_COLUMNS).eq('user_id', userId).is('deleted_at', null);
  if (filters.from) q = q.gte('transaction_at', filters.from);
  if (filters.to) q = q.lt('transaction_at', filters.to);
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  const payeeFilter = filters.payee ? payeeOrFilter(filters.payee) : null;
  if (payeeFilter) q = q.or(payeeFilter);
  const { data } = await q
    .order('transaction_at', { ascending: false })
    .order('id', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1)
    .throwOnError()
    .overrideTypes<TransactionRow[], { merge: false }>();
  return data;
}

export async function fetchActive(db: DimeSupabaseClient, userId: string, id: string): Promise<TransactionRow | null> {
  const { data } = await db
    .from('transactions')
    .select(DETAIL_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(1)
    .throwOnError()
    .overrideTypes<TransactionRow[], { merge: false }>();
  return data[0] ?? null;
}

export async function findByPaymentHash(
  db: DimeSupabaseClient,
  userId: string,
  paymentHash: string,
): Promise<TransactionRow | null> {
  const { data } = await db
    .from('transactions')
    .select(DETAIL_COLUMNS)
    .eq('user_id', userId)
    .eq('payment_hash', paymentHash)
    .is('deleted_at', null)
    .limit(1)
    .throwOnError()
    .overrideTypes<TransactionRow[], { merge: false }>();
  return data[0] ?? null;
}

/** Insert one row; returns its id. A `(user_id, payment_hash)` clash throws a 23505 error. */
export async function insertTransaction(db: DimeSupabaseClient, row: Record<string, unknown>): Promise<string> {
  const { data } = await db
    .from('transactions')
    .insert(row)
    .select('id')
    .single()
    .throwOnError()
    .overrideTypes<{ id: string }, { merge: false }>();
  return data.id;
}

/** Update an active row owned by the user and return it; null when it does not exist (or is deleted). */
export async function updateForUser(
  db: DimeSupabaseClient,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<TransactionRow | null> {
  const { data } = await db
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select(DETAIL_COLUMNS)
    .throwOnError()
    .overrideTypes<TransactionRow[], { merge: false }>();
  return data[0] ?? null;
}

export async function softDelete(db: DimeSupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data } = await db
    .from('transactions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .select('id')
    .throwOnError()
    .overrideTypes<{ id: string }[], { merge: false }>();
  return data.length > 0;
}

/** Largest single debits in `[from, to)` (newest first on ties). */
export async function topDebits(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
  limit: number,
): Promise<TransactionRow[]> {
  const { data } = await db
    .from('transactions')
    .select(LIST_COLUMNS)
    .eq('user_id', userId)
    .eq('type', 'debit')
    .is('deleted_at', null)
    .gte('transaction_at', range.from)
    .lt('transaction_at', range.to)
    .order('amount', { ascending: false })
    .order('transaction_at', { ascending: false })
    .limit(limit)
    .throwOnError()
    .overrideTypes<TransactionRow[], { merge: false }>();
  return data;
}

/* ----------------------------------------------------------------------------------------------
 * Aggregates: RPC first, raw rows as the fallback
 * -------------------------------------------------------------------------------------------- */

async function fetchAllPages<T>(page: (offset: number, last: number) => PromiseLike<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const chunk = await page(offset, offset + PAGE_SIZE - 1);
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) return all;
  }
}

/** `transactions_period_summary` over the half-open `[from, to)`; null if the RPC is missing or fails. */
export async function rpcPeriodSummary(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
): Promise<PeriodSummary | null> {
  const res = await db.rpc('transactions_period_summary', {
    p_user_id: userId,
    p_from: range.from,
    p_to: range.to,
  });
  const data: unknown = res.data;
  const error: unknown = res.error;
  if (error) {
    log.warn('transactions_period_summary_rpc_failed', { err: error });
    return null;
  }
  const parsed = parsePeriodSummary(data);
  if (!parsed) log.warn('transactions_period_summary_unexpected_shape', {});
  return parsed;
}

export async function fetchAmountTypeCategoryRows(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
): Promise<AmountTypeCategoryRow[]> {
  return fetchAllPages((offset, last) =>
    db
      .from('transactions')
      .select('amount,type,category_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('transaction_at', range.from)
      .lt('transaction_at', range.to)
      .order('transaction_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, last)
      .throwOnError()
      .overrideTypes<AmountTypeCategoryRow[], { merge: false }>()
      .then((r) => r.data),
  );
}

export async function fetchAmountTypeAtRows(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
): Promise<AmountTypeAtRow[]> {
  return fetchAllPages((offset, last) =>
    db
      .from('transactions')
      .select('amount,type,transaction_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('transaction_at', range.from)
      .lt('transaction_at', range.to)
      .order('transaction_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, last)
      .throwOnError()
      .overrideTypes<AmountTypeAtRow[], { merge: false }>()
      .then((r) => r.data),
  );
}

/**
 * `transactions_daily_totals`: per local-day credit/debit totals computed in SQL (one small row per
 * day instead of every transaction). Null if the function is missing (migration not applied yet).
 */
export async function rpcDailyTotals(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
  tz: string,
): Promise<DayTotals[] | null> {
  const res = await db.rpc('transactions_daily_totals', {
    p_user_id: userId,
    p_from: range.from,
    p_to: range.to,
    p_tz: tz,
  });
  const data: unknown = res.data;
  const error: unknown = res.error;
  if (error || !Array.isArray(data)) {
    log.warn('transactions_daily_totals_rpc_failed', { err: error });
    return null;
  }
  const out: DayTotals[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const day = typeof raw['day'] === 'string' ? raw['day'].slice(0, 10) : '';
    if (!day) continue;
    out.push({
      day,
      creditCents: toCents(raw['credit_total']),
      debitCents: toCents(raw['debit_total']),
      count: (Number(raw['credit_count']) || 0) + (Number(raw['debit_count']) || 0),
    });
  }
  return out;
}

export interface PayeeRow {
  type: 'debit' | 'credit';
  payee_key: string;
  display_name: string;
  total_cents: number;
  count: number;
}

/** `transactions_payee_totals`: per payee debit and credit totals; null if the function is missing. */
export async function rpcPayeeTotals(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
): Promise<PayeeRow[] | null> {
  const res = await db.rpc('transactions_payee_totals', {
    p_user_id: userId,
    p_from: range.from,
    p_to: range.to,
  });
  const data: unknown = res.data;
  const error: unknown = res.error;
  if (error || !Array.isArray(data)) {
    log.warn('transactions_payee_totals_rpc_failed', { err: error });
    return null;
  }
  const out: PayeeRow[] = [];
  for (const raw of data as Record<string, unknown>[]) {
    const type = raw['type'];
    if ((type !== 'debit' && type !== 'credit') || typeof raw['payee_key'] !== 'string') continue;
    out.push({
      type,
      payee_key: raw['payee_key'],
      display_name: typeof raw['display_name'] === 'string' && raw['display_name'] ? raw['display_name'] : 'Unknown',
      total_cents: toCents(raw['total']),
      count: Number(raw['transaction_count']) || 0,
    });
  }
  return out;
}

export interface PayeeSourceRow {
  amount: number | string;
  type: string;
  counterparty_name: string | null;
  counterparty_normalized: string | null;
  transaction_at: string;
}

/** Debit and credit rows with payee fields (fallback for `rpcPayeeTotals`), newest first. */
export async function fetchPayeeRows(
  db: DimeSupabaseClient,
  userId: string,
  range: { from: string; to: string },
): Promise<PayeeSourceRow[]> {
  return fetchAllPages((offset, last) =>
    db
      .from('transactions')
      .select('amount,type,counterparty_name,counterparty_normalized,transaction_at')
      .eq('user_id', userId)
      .in('type', ['debit', 'credit'])
      .is('deleted_at', null)
      .gte('transaction_at', range.from)
      .lt('transaction_at', range.to)
      .order('transaction_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, last)
      .throwOnError()
      .overrideTypes<PayeeSourceRow[], { merge: false }>()
      .then((r) => r.data),
  );
}
