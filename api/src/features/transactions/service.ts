import { isUniqueViolation } from '../../core/db-errors';
import { formatCents, formatMoney } from '../../core/decimal';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { isoUtc, isoUtcOrNull } from '../../core/timestamps';
import { addDays, dateKey, lastNDaysRange, localDate, monthRange, parseTimezone } from '../../core/timezone';
import type { IsoRange } from '../../core/timezone';
import { fetchMetaByIds, listVisibleIdName } from '../categories/repository';
import type { CategoryMeta } from '../categories/repository';
import type { CategoryScope } from '../categories/schemas';
import { emit } from '../realtime/publish';
import { inserted, updated as changed } from '../realtime/events';
import type { Publish } from '../realtime/events';
import { signMediaUrls } from '../media/storage';
import type { MediaStore, SignOptions } from '../media/storage';
import { UNCATEGORIZED_KEY, buildDaySummaries, dailyDebitSeries, dayTotalsFromRows, debitByCategoryResponse, fixedFlexibleFields } from './aggregates';
import type { DayTotals, PeriodSummary } from './aggregates';
import { buildPaymentHash, buildSparseMergePatch, normalizedOrNull } from './dedupe';
import * as repo from './repository';
import type { NewTransactionRow } from './repository';
import type {
  CounterpartyType,
  HomeOverviewResponse,
  Instant,
  ListQuery,
  MonthSummaryResponse,
  TopCategoryRow,
  TransactionListResponse,
  TransactionResponse,
  TransactionRow,
  TransactionType,
  TransactionWriteBody,
} from './schemas';

/** Everything the transaction services need from the request: DB, media store, user and media signing config. */
export interface TxContext {
  db: Db;
  /** R2 media (receipt / voice URL signing). */
  storage: MediaStore;
  userId: string;
  media: SignOptions;
  /** Live-update broadcast to this user's devices. Optional: absent = no broadcast (read-only callers, unit tests). */
  publish?: Publish | undefined;
}

/** Aggregate loaders only need the DB and the user (the budget evaluator has no media config). */
export type DbScope = Pick<TxContext, 'db' | 'userId'>;

const NOT_FOUND = 'Transaction not found.';
const CLASH = 'Another transaction already has the same amount, payee, type and time.';
const COUNTERPARTY_TYPES: ReadonlySet<string> = new Set(['merchant', 'person', 'self_transfer', 'unknown']);

/* ----------------------------------------------------------------------------------------------
 * Row -> response (category display fields + signed media URLs)
 * -------------------------------------------------------------------------------------------- */

interface Enrichment {
  meta: Map<string, CategoryMeta>;
  signed: Map<string, string | null>;
}

const blank = (v: unknown): v is null | undefined | '' => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function categoryIdsOf(rows: readonly TransactionRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) if (!blank(row.category_id)) ids.add(String(row.category_id).trim().toLowerCase());
  return [...ids];
}

/**
 * Category display fields and signed media URLs for a set of rows, fetched concurrently (one
 * categories query, one signing call per bucket). `extraCategoryIds` lets a caller (home) resolve
 * more categories in the same query.
 */
async function loadEnrichment(
  ctx: TxContext,
  rows: readonly TransactionRow[],
  extraCategoryIds: readonly string[] = [],
): Promise<Enrichment> {
  const ids = [...new Set([...categoryIdsOf(rows), ...extraCategoryIds.map((id) => id.toLowerCase())])];
  const stored = rows.flatMap((r) => [r.receipt_url, r.voice_url]);
  const [meta, signed] = await Promise.all([
    fetchMetaByIds(ctx.db, ids, ctx.userId),
    stored.some((v) => typeof v === 'string' && v) ? signMediaUrls(ctx.storage, stored, ctx.media) : Promise.resolve(new Map<string, string | null>()),
  ]);
  return { meta, signed };
}

function normalizeDetectedVia(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  return s === 'upi' ? 'notification' : s;
}

function toResponse(row: TransactionRow, enrichment: Enrichment): TransactionResponse {
  const name = typeof row.counterparty_name === 'string' ? row.counterparty_name : null;
  const cid = blank(row.category_id) ? null : String(row.category_id);
  const cat = cid ? enrichment.meta.get(cid.trim().toLowerCase()) : undefined;
  const catName = typeof cat?.name === 'string' && cat.name.trim() ? cat.name.trim() : null;
  const cpType = typeof row.counterparty_type === 'string' ? row.counterparty_type.trim() : '';
  const media = (stored: string | null | undefined) => (typeof stored === 'string' && stored ? (enrichment.signed.get(stored) ?? null) : null);
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    amount: formatMoney(row.amount),
    type: row.type,
    counterparty_name: name,
    counterparty_type: (COUNTERPARTY_TYPES.has(cpType) ? cpType : 'merchant') as CounterpartyType,
    counterparty_normalized: row.counterparty_normalized ?? null,
    merchant: name?.trim() ?? '',
    category: catName,
    category_id: cid,
    category_icon_name: typeof cat?.icon_name === 'string' ? cat.icon_name : null,
    category_color: typeof cat?.color === 'string' ? cat.color : null,
    category_scope: cat?.scope ?? null,
    recurring_item_id: row.recurring_item_id ?? null,
    note: row.note ?? null,
    detected_via: normalizeDetectedVia(row.detected_via),
    transaction_at: isoUtc(row.transaction_at),
    created_at: isoUtc(row.created_at),
    updated_at: isoUtc(row.updated_at ?? row.created_at),
    deleted_at: isoUtcOrNull(row.deleted_at),
    receipt_url: media(row.receipt_url),
    voice_url: media(row.voice_url),
    payment_hash: row.payment_hash ?? null,
  };
}

export async function enrichRows(ctx: TxContext, rows: readonly TransactionRow[]): Promise<TransactionResponse[]> {
  if (rows.length === 0) return [];
  const enrichment = await loadEnrichment(ctx, rows);
  return rows.map((row) => toResponse(row, enrichment));
}

/* ----------------------------------------------------------------------------------------------
 * Aggregates
 * -------------------------------------------------------------------------------------------- */

/** Per local-day totals for `[from, to)`: rows are bucketed in TypeScript (SQLite has no IANA timezones). */
export async function loadDayTotals(ctx: DbScope, range: IsoRange, tz: string): Promise<DayTotals[]> {
  return dayTotalsFromRows(await repo.fetchAmountTypeAtRows(ctx.db, ctx.userId, range), tz);
}

/** Credit/debit totals, count and debit-by-category for `[from, to)`: one GROUP BY query. */
export function loadPeriodSummary(ctx: DbScope, range: IsoRange): Promise<PeriodSummary> {
  return repo.periodSummary(ctx.db, ctx.userId, range);
}

/* ----------------------------------------------------------------------------------------------
 * Reads
 * -------------------------------------------------------------------------------------------- */

export async function listTransactions(ctx: TxContext, q: ListQuery): Promise<TransactionListResponse> {
  const payee = q.payee?.trim() || undefined;
  const filters = { from: q.from?.iso, to: q.to?.iso, categoryId: q.category_id, payee };
  // Per-day totals describe the whole requested range, so they are only meaningful (and only
  // computed) for the first page of an unfiltered range query.
  const wantSummaries = q.offset === 0 && filters.from && filters.to && q.timezone && !filters.categoryId && !payee;
  const tz = wantSummaries ? parseTimezone(q.timezone ?? '') : undefined;

  const [rows, totals] = await Promise.all([
    repo.listPage(ctx.db, ctx.userId, { filters, limit: q.limit + 1, offset: q.offset }),
    tz && filters.from && filters.to ? loadDayTotals(ctx, { from: filters.from, to: filters.to }, tz) : Promise.resolve([]),
  ]);
  const hasMore = rows.length > q.limit;
  const items = await enrichRows(ctx, hasMore ? rows.slice(0, q.limit) : rows);
  return { items, has_more: hasMore, day_summaries: buildDaySummaries(totals) };
}

export async function getTransaction(ctx: TxContext, id: string): Promise<TransactionResponse> {
  const row = await repo.fetchActive(ctx.db, ctx.userId, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return (await enrichRows(ctx, [row]))[0] as TransactionResponse;
}

export async function monthSummary(
  ctx: TxContext,
  input: { year: number; month: number; timezone: string },
): Promise<MonthSummaryResponse> {
  const tz = parseTimezone(input.timezone);
  const summary = await loadPeriodSummary(ctx, monthRange(tz, input.year, input.month));
  const debitByCategory = debitByCategoryResponse(summary);
  // Meta of every spent category, of any scope: posted recurring items keep their recurring category,
  // which the spend-scoped categories list does not carry.
  const meta = await fetchMetaByIds(
    ctx.db,
    Object.keys(debitByCategory).filter((key) => key !== UNCATEGORIZED_KEY),
    ctx.userId,
  );
  return {
    credit_total: formatCents(summary.creditCents),
    debit_total: formatCents(summary.debitCents),
    net: formatCents(summary.creditCents - summary.debitCents),
    transaction_count: summary.count,
    ...fixedFlexibleFields(summary),
    debit_by_category: debitByCategory,
    category_meta: [...meta.values()].map(({ id, name, icon_name, color, scope }) => ({ id, name: name.trim(), icon_name, color, scope })),
  };
}

const TOP_CATEGORIES = 5;
const RECENT_COUNT = 5;
const WEEK_DAYS = 7;

/**
 * Home dashboard. Round trips: month summary + 7-day daily totals + 5 newest rows run
 * together, then one categories query (top categories and recent rows together) and one media
 * signing call. "Spent today" is the last day of the 7-day series (same local-day range Python used).
 */
export async function homeOverview(ctx: TxContext, timezone: string, nowMs: number = Date.now()): Promise<HomeOverviewResponse> {
  const tz = parseTimezone(timezone);
  const today = localDate(tz, nowMs);
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i - (WEEK_DAYS - 1)));

  const [month, weekTotals, recent] = await Promise.all([
    loadPeriodSummary(ctx, monthRange(tz, today.year, today.month)),
    loadDayTotals(ctx, lastNDaysRange(tz, today, WEEK_DAYS), tz),
    repo.listPage(ctx.db, ctx.userId, { filters: {}, limit: RECENT_COUNT, offset: 0 }),
  ]);

  // Everyday spending only: recurring (fixed) categories are shown as their own split, not as a "top category".
  const top = [...month.debitByCategory]
    .filter(([key]) => !month.fixedDebitCategories.has(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORIES)
    .map(([key, cents]) => ({ id: key === '' ? null : key, cents }));
  const enrichment = await loadEnrichment(
    ctx,
    recent,
    top.flatMap((t) => (t.id ? [t.id] : [])),
  );

  const top_categories: TopCategoryRow[] = top.map(({ id, cents }) => {
    if (id === null) return { category_id: null, name: 'Uncategorized', icon_name: 'Package', color: null, total: formatCents(cents) };
    const meta = enrichment.meta.get(id.toLowerCase());
    return {
      category_id: id,
      name: typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : 'Uncategorized',
      icon_name: typeof meta?.icon_name === 'string' ? meta.icon_name : null,
      color: typeof meta?.color === 'string' ? meta.color : null,
      total: formatCents(cents),
    };
  });

  const todayTotals = weekTotals.find((t) => t.day === dateKey(today));
  return {
    spent_today: formatCents(todayTotals?.debitCents ?? 0),
    spent_this_month: formatCents(month.debitCents),
    fixed_spent_this_month: formatCents(month.fixedDebitCents),
    flexible_spent_this_month: formatCents(month.debitCents - month.fixedDebitCents),
    top_categories,
    recent_transactions: recent.map((row) => toResponse(row, enrichment)),
    last_7_days_spend: dailyDebitSeries(weekTotals, days),
  };
}

/* ----------------------------------------------------------------------------------------------
 * Writes
 * -------------------------------------------------------------------------------------------- */

interface ResolvedCategory {
  id: string;
  scope: CategoryScope;
}

/**
 * Category for a write: a visible `category_id` wins; otherwise the `category` name is matched
 * case-insensitively against the categories visible to the user. One query serves both, and none
 * is made when the request names no category. A name only matches spending categories (so an AI-guessed or typed
 * "Rent" never lands on a recurring category); an id may name any scope and the caller decides.
 */
async function resolveCategory(
  ctx: TxContext,
  input: { categoryId?: string | null | undefined; categoryName?: string | null | undefined },
  anyScopeByName = false,
): Promise<ResolvedCategory | null> {
  const wantedName = input.categoryName?.trim().toLowerCase() ?? '';
  if (!input.categoryId && !wantedName) return null;
  const visible = await listVisibleIdName(ctx.db, ctx.userId);
  if (input.categoryId) {
    const id = input.categoryId.toLowerCase();
    const hit = visible.find((c) => String(c.id).toLowerCase() === id);
    if (hit) return { id, scope: hit.scope };
  }
  if (!wantedName) return null;
  const hit = visible.find(
    (c) => typeof c.name === 'string' && c.name.trim().toLowerCase() === wantedName && (anyScopeByName || c.scope === 'spend'),
  );
  return hit ? { id: String(hit.id), scope: hit.scope } : null;
}

const SCOPE_MISMATCH = 'Choose a category that matches the transaction type.';
const RECURRING_ONLY = 'Recurring categories can only be used by recurring items. Choose an everyday category.';

/** A recurring-scope category fits only its own direction: recurring_expense <-> debit, recurring_income <-> credit. */
const fitsType = (scope: CategoryScope, type: TransactionType): boolean =>
  scope === 'spend' || (scope === 'recurring_expense' && type === 'debit') || (scope === 'recurring_income' && type === 'credit');

export interface NewTransactionInput {
  /** Decimal string with two places ("250.50"). */
  amount: string;
  type: TransactionType;
  counterpartyName: string;
  counterpartyType?: CounterpartyType | null | undefined;
  categoryId?: string | null | undefined;
  categoryName?: string | null | undefined;
  note?: string | null | undefined;
  transactionAt: Instant;
  /** Server-set only: `manual` for the public endpoint, capture sources for the R3 workers. */
  detectedVia?: string | undefined;
  receiptUrl?: string | null | undefined;
  voiceUrl?: string | null | undefined;
  /** Server-set only (recurring postings): replaces the content fingerprint, e.g. `recurring:<item>:<date>`. */
  paymentHash?: string | undefined;
  /** Server-set only: the recurring item that produced this row. */
  recurringItemId?: string | undefined;
}

export type CreateResult =
  | { kind: 'created'; id: string; categoryId: string | null; paymentHash: string }
  /** A transaction with the same payment hash already existed (missing fields were merged into it). */
  | { kind: 'existing'; id: string };

/**
 * Insert a transaction with payment-hash dedupe: a hit sparse-merges the missing fields into the
 * existing row, and losing an insert race to the unique index resolves to the winner.
 */
export async function createTransaction(ctx: TxContext, input: NewTransactionInput): Promise<CreateResult> {
  const name = input.counterpartyName.trim();
  const normalized = normalizedOrNull(name);
  const paymentHash =
    input.paymentHash ??
    (await buildPaymentHash({
      amount: input.amount,
      type: input.type,
      counterpartyNormalized: normalized,
      counterpartyName: name,
      transactionAtMs: input.transactionAt.ms,
    }));
  const [resolved, existing] = await Promise.all([
    resolveCategory(ctx, input, Boolean(input.recurringItemId)),
    repo.findByPaymentHash(ctx.db, ctx.userId, paymentHash),
  ]);
  // Recurring-scope categories belong to recurring items: only the poster (which sets `recurringItemId`, and is trusted) may use one.
  if (resolved && !input.recurringItemId && resolved.scope !== 'spend') throw new ValidationError(RECURRING_ONLY);
  const categoryId = resolved?.id ?? null;

  const row: NewTransactionRow = {
    user_id: ctx.userId,
    amount: input.amount,
    type: input.type,
    note: input.note ?? null,
    detected_via: input.detectedVia || 'manual',
    transaction_at: input.transactionAt.iso,
    category_id: categoryId,
    receipt_url: input.receiptUrl ?? null,
    voice_url: input.voiceUrl ?? null,
    counterparty_name: name,
    counterparty_normalized: normalized,
    payment_hash: paymentHash,
    recurring_item_id: input.recurringItemId ?? null,
  };
  if (input.counterpartyType) row.counterparty_type = input.counterpartyType;

  if (existing) {
    const patch = buildSparseMergePatch(existing, row);
    if (Object.keys(patch).length > 0) {
      log.info('transaction_dedupe_merge', { id: existing.id });
      const merged = await repo.updateForUser(ctx.db, ctx.userId, existing.id, patch);
      if (merged) await emit(ctx.publish, [changed('transactions', merged)]);
    } else {
      log.info('transaction_dedupe_skip', { id: existing.id });
    }
    return { kind: 'existing', id: existing.id };
  }

  try {
    const stored = await repo.insertTransactionRow(ctx.db, row);
    await emit(ctx.publish, [inserted('transactions', stored)]);
    return { kind: 'created', id: stored.id, categoryId, paymentHash };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await repo.findByPaymentHash(ctx.db, ctx.userId, paymentHash);
      if (raced) {
        log.info('transaction_dedupe_race', { id: raced.id });
        return { kind: 'existing', id: raced.id };
      }
    }
    throw err;
  }
}

/** `POST /transactions`: manual entry. Server-only fields are never taken from the client. */
export function createManual(ctx: TxContext, body: TransactionWriteBody): Promise<CreateResult> {
  return createTransaction(ctx, {
    amount: body.amount,
    type: body.type,
    counterpartyName: body.counterparty_name,
    counterpartyType: body.counterparty_type,
    categoryId: body.category_id,
    categoryName: body.category,
    note: body.note,
    transactionAt: body.transaction_at,
    detectedVia: 'manual',
  });
}

export async function updateTransaction(ctx: TxContext, id: string, body: TransactionWriteBody): Promise<TransactionResponse> {
  const name = body.counterparty_name.trim();
  const normalized = normalizedOrNull(name);
  const newHash = await buildPaymentHash({
    amount: body.amount,
    type: body.type,
    counterpartyNormalized: normalized,
    counterpartyName: name,
    transactionAtMs: body.transaction_at.ms,
  });

  const [existing, resolved, clash] = await Promise.all([
    repo.fetchActive(ctx.db, ctx.userId, id),
    resolveCategory(ctx, { categoryId: body.category_id, categoryName: body.category }),
    repo.findByPaymentHash(ctx.db, ctx.userId, newHash),
  ]);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  // A recurring-scope category may be set only on a row a recurring item posted, and then only in its own
  // direction. A row keeps the category it already has when the client echoes it back unchanged, as long
  // as it still fits the (possibly changed) type.
  if (
    resolved &&
    resolved.scope !== 'spend' &&
    (resolved.id !== String(existing.category_id ?? '').toLowerCase() || !fitsType(resolved.scope, body.type))
  ) {
    if (!existing.recurring_item_id) throw new ValidationError(RECURRING_ONLY);
    if (!fitsType(resolved.scope, body.type)) throw new ValidationError(SCOPE_MISMATCH);
  }
  // A name never matches a recurring category (only recurring-posted rows carry one), so an echoed-back
  // name that doesn't resolve keeps such a row's category instead of silently clearing it.
  let categoryId = resolved?.id ?? null;
  if (!resolved && body.category?.trim() && existing.category_id) {
    const current = await resolveCategory(ctx, { categoryId: existing.category_id });
    if (current && current.scope !== 'spend') categoryId = current.id;
  }

  const patch: Record<string, unknown> = {
    amount: body.amount,
    type: body.type,
    note: body.note ?? null,
    transaction_at: body.transaction_at.iso,
    category_id: categoryId,
    counterparty_name: name,
    counterparty_normalized: normalized,
  };
  if (body.counterparty_type) patch['counterparty_type'] = body.counterparty_type;

  // Keep the duplicate-detection fingerprint in step with the editable fields.
  if (newHash !== existing.payment_hash) {
    if (clash && clash.id !== id) {
      if (existing.payment_hash) throw new ConflictError(CLASH);
      // Legacy row without a hash that would collide: leave the hash unset.
    } else {
      patch['payment_hash'] = newHash;
    }
  }

  let updated: TransactionRow | null;
  try {
    updated = await repo.updateForUser(ctx.db, ctx.userId, id, patch);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError(CLASH);
    throw err;
  }
  if (!updated) throw new NotFoundError(NOT_FOUND);
  await emit(ctx.publish, [changed('transactions', updated)]);
  return (await enrichRows(ctx, [updated]))[0] as TransactionResponse;
}

export async function deleteTransaction(ctx: TxContext, id: string): Promise<void> {
  const deletedRow = await repo.softDeleteRow(ctx.db, ctx.userId, id);
  if (!deletedRow) throw new NotFoundError(NOT_FOUND);
  // A soft delete reaches the app as an UPDATE with `deleted_at` set (what the app's handlers expect).
  await emit(ctx.publish, [changed('transactions', deletedRow)]);
}
