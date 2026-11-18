import { isUniqueViolation } from '../../core/db-errors';
import { decimalToCents, formatCents, formatMoney } from '../../core/decimal';
import { ConflictError, NotFoundError, StaleError, ValidationError } from '../../core/errors';
import { log } from '../../core/logging';
import type { Db } from '../../core/db';
import { isoUtc, isoUtcOrNull } from '../../core/timestamps';
import { IST, addDays, dateKey, localDate, monthDates, monthKey, monthKeyOf, parseTimezone } from '../../core/timezone';
import { existingBrandId, resolveBrandId } from '../brands/service';
import { monthlyCapCents } from '../budgets/history';
import { fetchMetaByIds, listVisibleIdName } from '../categories/repository';
import type { CategoryMeta } from '../categories/repository';
import type { CategoryScope } from '../categories/schemas';
import type { AfterWrite } from '../notifications/budget-alerts';
import { addSkip, removeSkip } from '../recurring/repository';
import { releaseTransaction } from '../reminders/service';
import { emit } from '../realtime/publish';
import { inserted, updated as changed } from '../realtime/events';
import type { Publish } from '../realtime/events';
import { signMediaUrls } from '../media/storage';
import type { MediaStore, SignOptions } from '../media/storage';
import { fetchByUserId } from '../user-settings/repository';
import { resolveUserTimezone } from '../user-settings/service';
import { settingsFromRow } from '../user-settings/snapshot';
import { UNCATEGORIZED_KEY, budgetPicture, buildDaySummaries, dailyDebitSeries, debitByCategoryResponse, fixedFlexibleFields, totalsOf } from './aggregates';
import { normalizedOrNull, payeeKey } from './dedupe';
import { inferKind } from './kind-rules';
import { dayTotals, periodLedger } from './ledger';
import * as repo from './repository';
import type { NewTransactionRow } from './repository';
import { assertNotTooFarAhead, defaultKind, kindFitsType } from './schemas';
import type {
  CounterpartyType,
  HomeOverviewResponse,
  Instant,
  ListQuery,
  MonthSummaryResponse,
  TopCategoryRow,
  TransactionKind,
  TransactionListResponse,
  TransactionPatchBody,
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
  /**
   * Called after a write that can move a month's spend (with the `YYYY-MM` months to re-check), to reconcile the budget
   * alerts. Routes defer it with `waitUntil`, the queue consumer and the cron await it. Never throws into the write.
   */
  afterWrite?: AfterWrite | undefined;
}

/** Aggregate loaders only need the DB and the user (the budget alerts have no media config). */
export type DbScope = Pick<TxContext, 'db' | 'userId'>;

const NOT_FOUND = 'Transaction not found.';
const COUNTERPARTY_TYPES: ReadonlySet<string> = new Set(['merchant', 'person', 'self_transfer', 'unknown']);

/* ----------------------------------------------------------------------------------------------
 * Row -> response (category display fields, linked paybacks, signed media URLs)
 * -------------------------------------------------------------------------------------------- */

interface Enrichment {
  meta: Map<string, CategoryMeta>;
  signed: Map<string, string | null>;
  /** Cents of paybacks linked to each row id. */
  offsets: Map<string, number>;
}

const blank = (v: unknown): v is null | undefined | '' => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function categoryIdsOf(rows: readonly TransactionRow[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) if (!blank(row.category_id)) ids.add(String(row.category_id).trim().toLowerCase());
  return [...ids];
}

/**
 * Category display fields, linked payback totals and signed media URLs for a set of rows, fetched concurrently (one
 * categories query, one offsets query, one signing call per bucket). `extraCategoryIds` lets a caller (home) resolve
 * more categories in the same query.
 */
async function loadEnrichment(
  ctx: TxContext,
  rows: readonly TransactionRow[],
  extraCategoryIds: readonly string[] = [],
): Promise<Enrichment> {
  const ids = [...new Set([...categoryIdsOf(rows), ...extraCategoryIds.map((id) => id.toLowerCase())])];
  const stored = rows.flatMap((r) => [r.receipt_url, r.voice_url]);
  const [meta, signed, offsets] = await Promise.all([
    fetchMetaByIds(ctx.db, ids, ctx.userId),
    stored.some((v) => typeof v === 'string' && v) ? signMediaUrls(ctx.storage, stored, ctx.media) : Promise.resolve(new Map<string, string | null>()),
    rows.some((r) => r.kind !== 'transfer') ? repo.offsetTotals(ctx.db, ctx.userId, rows.map((r) => r.id)) : Promise.resolve(new Map<string, number>()),
  ]);
  return { meta, signed, offsets };
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
  const offset = enrichment.offsets.get(row.id) ?? 0;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    amount: formatMoney(row.amount),
    type: row.type,
    kind: row.kind ?? defaultKind(row.type, cpType),
    offset_total: formatCents(offset),
    effective_amount: formatCents(decimalToCents(row.amount) - offset),
    needs_review: row.needs_review === 1,
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
    brand_id: row.brand_id ?? null,
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
 * Reads
 * -------------------------------------------------------------------------------------------- */

export async function listTransactions(ctx: TxContext, q: ListQuery): Promise<TransactionListResponse> {
  const payee = q.payee?.trim() || undefined;
  const filters = { from: q.from?.iso, to: q.to?.iso, categoryId: q.category_id, payee, recurringItemId: q.recurring_item_id };
  // Per-day totals describe the whole requested range, so they are only meaningful (and only
  // computed) for the first page of an unfiltered range query.
  const wantSummaries = q.offset === 0 && filters.from && filters.to && q.timezone && !filters.categoryId && !payee && !filters.recurringItemId;
  if (wantSummaries) parseTimezone(q.timezone ?? ''); // 400 for an unknown name; the days themselves are each row's stored local date

  const [rows, totals] = await Promise.all([
    repo.listPage(ctx.db, ctx.userId, { filters, limit: q.limit + 1, offset: q.offset }),
    wantSummaries && filters.from && filters.to ? dayTotals(ctx.db, ctx.userId, { instants: { from: filters.from, to: filters.to } }) : Promise.resolve([]),
  ]);
  const hasMore = rows.length > q.limit;
  const items = await enrichRows(ctx, hasMore ? rows.slice(0, q.limit) : rows);
  return { items, has_more: hasMore, day_summaries: buildDaySummaries(totals) };
}

export async function getTransaction(ctx: TxContext, id: string): Promise<TransactionResponse> {
  const row = await getTransactionOrNull(ctx, id);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return row;
}

/** The enriched active row, or `null` when it is gone (deleted since, or never the caller's). */
export async function getTransactionOrNull(ctx: TxContext, id: string): Promise<TransactionResponse | null> {
  const row = await repo.fetchActive(ctx.db, ctx.userId, id);
  return row ? ((await enrichRows(ctx, [row]))[0] as TransactionResponse) : null;
}

export async function monthSummary(
  ctx: TxContext,
  input: { year: number; month: number; timezone: string },
): Promise<MonthSummaryResponse> {
  parseTimezone(input.timezone); // 400 for an unknown name; the month is the rows' stored month, whatever the device says
  const [ledger, cap] = await Promise.all([
    periodLedger(ctx.db, ctx.userId, { dates: monthDates(input.year, input.month) }),
    monthlyCapCents(ctx.db, ctx.userId, monthKey(input.year, input.month)),
  ]);
  const debitByCategory = debitByCategoryResponse(ledger.spendByCategory);
  // Meta of every spent category, of any scope: posted recurring items keep their recurring category,
  // which the spend-scoped categories list does not carry.
  const meta = await fetchMetaByIds(
    ctx.db,
    Object.keys(debitByCategory).filter((key) => key !== UNCATEGORIZED_KEY),
    ctx.userId,
  );
  return {
    credit_total: formatCents(ledger.incomeCents),
    debit_total: formatCents(ledger.spendCents),
    net: formatCents(ledger.incomeCents - ledger.spendCents),
    transaction_count: ledger.count,
    ...fixedFlexibleFields(totalsOf(ledger)),
    debit_by_category: debitByCategory,
    category_meta: [...meta.values()].map(({ id, name, icon_name, color, scope }) => ({ id, name: name.trim(), icon_name, color, scope })),
    ...budgetPicture(ledger, cap),
  };
}

const TOP_CATEGORIES = 5;
const RECENT_COUNT = 5;
const WEEK_DAYS = 7;

/**
 * Home dashboard. Round trips: month ledger + month cap + 7-day daily totals + 5 newest rows run
 * together, then one categories query (top categories and recent rows together) and one media
 * signing call. "Spent today" is the last day of the 7-day series.
 */
export async function homeOverview(ctx: TxContext, timezone: string, nowMs: number = Date.now()): Promise<HomeOverviewResponse> {
  const tz = parseTimezone(timezone);
  const today = localDate(tz, nowMs);
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i - (WEEK_DAYS - 1)));

  const [ledger, cap, weekTotals, recent] = await Promise.all([
    periodLedger(ctx.db, ctx.userId, { dates: monthDates(today.year, today.month) }),
    monthlyCapCents(ctx.db, ctx.userId, monthKeyOf(today)),
    dayTotals(ctx.db, ctx.userId, { dates: { from: dateKey(days[0] ?? today), to: dateKey(today) } }),
    repo.listPage(ctx.db, ctx.userId, { filters: {}, limit: RECENT_COUNT, offset: 0 }),
  ]);

  // Everyday spending only: fixed (recurring) money is shown as its own split, not as a "top category".
  const top = [...ledger.flexSpendByCategory]
    .filter(([, cents]) => cents > 0)
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
    spent_this_month: formatCents(ledger.spendCents),
    fixed_spent_this_month: formatCents(ledger.fixedSpendCents),
    flexible_spent_this_month: formatCents(ledger.flexSpendCents),
    top_categories,
    recent_transactions: recent.map((row) => toResponse(row, enrichment)),
    last_7_days_spend: dailyDebitSeries(weekTotals, days),
    ...budgetPicture(ledger, cap),
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
const KIND_MISMATCH = 'This kind does not fit the transaction type: spend is money out, income and payback are money in, transfer is either.';

/** A recurring-scope category fits only its own direction: recurring_expense <-> debit, recurring_income <-> credit. */
const fitsType = (scope: CategoryScope, type: TransactionType): boolean =>
  scope === 'spend' || (scope === 'recurring_expense' && type === 'debit') || (scope === 'recurring_income' && type === 'credit');

/** Months of a row that a spend-affecting change touches; `YYYY-MM`. A row the backfill has not reached is placed in IST. */
export function monthOfRow(row: Pick<TransactionRow, 'month_key' | 'transaction_at'>): string {
  return row.month_key ?? monthKeyOf(localDate(IST, Date.parse(row.transaction_at)));
}

/** True when a row of this kind moves spend (and so the budget alerts): income and transfers never do. */
const movesSpend = (kind: TransactionKind | undefined): boolean => kind === 'spend' || kind === 'payback';

/** Runs the caller's `afterWrite` for the months of the affected rows; a failure is logged, never raised into the write. */
export async function afterSpendWrite(ctx: TxContext, rows: readonly Pick<TransactionRow, 'kind' | 'month_key' | 'transaction_at'>[]): Promise<void> {
  const months = [...new Set(rows.filter((r) => movesSpend(r.kind)).map(monthOfRow))];
  if (months.length === 0 || !ctx.afterWrite) return;
  try {
    await ctx.afterWrite(months);
  } catch (err) {
    log.error('after_write_failed', { err, months });
  }
}

export interface NewTransactionInput {
  /** Decimal string with two places ("250.50"). */
  amount: string;
  type: TransactionType;
  /** How the row counts; omitted = the default for the direction and counterparty (see `defaultKind`). */
  kind?: TransactionKind | null | undefined;
  counterpartyName: string;
  counterpartyType?: CounterpartyType | null | undefined;
  categoryId?: string | null | undefined;
  categoryName?: string | null | undefined;
  /** A catalogue brand the user picked; unknown ids are ignored. Without one the brand is resolved from the name. */
  brandId?: string | null | undefined;
  note?: string | null | undefined;
  transactionAt: Instant;
  /** The calendar day when the source knows it better than the instant (a receipt's printed date), `YYYY-MM-DD`. */
  localDate?: string | undefined;
  /** The caller's own timezone name: used for the row's local date when the user has stored none. */
  timezone?: string | undefined;
  /** Server-set only: `manual` for the public endpoint, capture sources for the R3 workers. */
  detectedVia?: string | undefined;
  receiptUrl?: string | null | undefined;
  voiceUrl?: string | null | undefined;
  /** Server-set only (captures): the idempotency identity of the job, `job:<job id>`. A retry resolves to the row it made. */
  paymentHash?: string | undefined;
  /** Server-set only: the recurring item that produced this row and the period (its due date) it stands for. */
  recurringItemId?: string | undefined;
  recurringOccurrence?: string | undefined;
  /** Force the row into review (a capture the caller already doubts). */
  needsReview?: boolean | undefined;
}

/** People and own-account transfers are never linked to a brand by name. */
const UNBRANDED_TYPES: ReadonlySet<string> = new Set(['person', 'self_transfer']);

/** The picked brand when it exists in the catalogue, else the brand the payee name resolves to (null for people and unknown names). */
async function pickBrand(db: Db, picked: string | null | undefined, name: string, counterpartyType: string | null | undefined): Promise<string | null> {
  if (counterpartyType && UNBRANDED_TYPES.has(counterpartyType)) return null; // even a picked brand: a person is not a brand
  const known = await existingBrandId(db, picked);
  if (known) return known;
  return resolveBrandId(db, name);
}

export type CreateResult =
  | {
      kind: 'created';
      id: string;
      categoryId: string | null;
      /** How the row counts. */
      txKind: TransactionKind;
      localDate: string;
      monthKey: string;
      /** A live row with the same type, amount and payee on the same day: a suggestion ("Undo / keep"), never a merge. */
      possibleDuplicateOf: string | null;
    }
  /** A retry of something already written (same job, same recurring occurrence): the row it made. */
  | { kind: 'existing'; id: string };

/** The capture sources whose rows are flagged for review when they look like a duplicate. */
const CAPTURE_SOURCES: ReadonlySet<string> = new Set(['scan', 'voice']);

/**
 * Insert a transaction. Idempotency covers exact retries only (the job hash of a capture, the occurrence of a recurring
 * posting); anything else always inserts, because two real Rs 20 teas in one minute are two rows. A row that looks like another
 * (same type, amount, payee, day) is reported as `possibleDuplicateOf`, and a capture is also put in review.
 */
export async function createTransaction(ctx: TxContext, input: NewTransactionInput): Promise<CreateResult> {
  const name = input.counterpartyName.trim();
  const normalized = normalizedOrNull(name);
  const [resolved, existing, brandId, tz] = await Promise.all([
    resolveCategory(ctx, input, Boolean(input.recurringItemId)),
    findExisting(ctx, input),
    pickBrand(ctx.db, input.brandId, name, input.counterpartyType),
    input.localDate ? Promise.resolve(null) : resolveUserTimezone(ctx.db, ctx.userId, input.timezone),
  ]);
  if (existing) return { kind: 'existing', id: existing.id };
  // Recurring-scope categories belong to recurring items: only the poster (which sets `recurringItemId`, and is trusted) may use one.
  if (resolved && !input.recurringItemId && resolved.scope !== 'spend') throw new ValidationError(RECURRING_ONLY);
  const categoryId = resolved?.id ?? null;

  const txKind = input.kind ?? defaultKind(input.type, input.counterpartyType);
  if (!kindFitsType(txKind, input.type)) throw new ValidationError(KIND_MISMATCH);
  const day = input.localDate ?? dateKey(localDate(tz as string, input.transactionAt.ms));

  const duplicateOf = input.recurringItemId
    ? null
    : await repo.findPossibleDuplicate(ctx.db, ctx.userId, { type: input.type, amountCents: decimalToCents(input.amount), payeeKey: payeeKey(normalized, name), localDate: day });
  const detectedVia = input.detectedVia || 'manual';

  const row: NewTransactionRow = {
    user_id: ctx.userId,
    amount: input.amount,
    type: input.type,
    kind: txKind,
    note: input.note ?? null,
    detected_via: detectedVia,
    transaction_at: input.transactionAt.iso,
    local_date: day,
    month_key: day.slice(0, 7),
    category_id: categoryId,
    receipt_url: input.receiptUrl ?? null,
    voice_url: input.voiceUrl ?? null,
    counterparty_name: name,
    counterparty_normalized: normalized,
    payment_hash: input.paymentHash ?? null,
    recurring_item_id: input.recurringItemId ?? null,
    recurring_occurrence: input.recurringOccurrence ?? null,
    brand_id: brandId,
    needs_review: Boolean(input.needsReview) || (duplicateOf !== null && CAPTURE_SOURCES.has(detectedVia)),
  };
  if (input.counterpartyType) row.counterparty_type = input.counterpartyType;

  let stored: TransactionRow;
  try {
    stored = await repo.insertTransactionRow(ctx.db, row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      const raced = await findExisting(ctx, input);
      if (raced) {
        log.info('transaction_idempotent_race', { id: raced.id });
        return { kind: 'existing', id: raced.id };
      }
    }
    throw err;
  }
  await emit(ctx.publish, [inserted('transactions', stored)]);
  await afterSpendWrite(ctx, [stored]);
  return { kind: 'created', id: stored.id, categoryId, txKind, localDate: day, monthKey: row.month_key, possibleDuplicateOf: duplicateOf };
}

/** The row an exact retry would duplicate: the capture's job identity, or the recurring occurrence. */
async function findExisting(ctx: TxContext, input: NewTransactionInput): Promise<TransactionRow | null> {
  if (input.paymentHash) return repo.findByPaymentHash(ctx.db, ctx.userId, input.paymentHash);
  if (input.recurringItemId && input.recurringOccurrence) return repo.findByOccurrence(ctx.db, ctx.userId, input.recurringItemId, input.recurringOccurrence);
  return null;
}

/**
 * How a manual entry counts when the client did not say: the payee name and note are read for own-account moves, ATM cash,
 * card bills and refunds (`kind-rules.ts`). ATM cash stays spend for a user who counts cash withdrawals as spend.
 */
async function manualKind(ctx: TxContext, body: TransactionWriteBody): Promise<TransactionKind | undefined> {
  if (body.kind) return body.kind;
  const inferred = inferKind({ type: body.type, name: body.counterparty_name, note: body.note });
  if (!inferred) return undefined;
  if (inferred.cashWithdrawal && settingsFromRow(await fetchByUserId(ctx.db, ctx.userId)).count_cash_withdrawals_as_spend) return undefined;
  return inferred.kind;
}

/** `POST /transactions`: manual entry. Server-only fields are never taken from the client. */
export async function createManual(ctx: TxContext, body: TransactionWriteBody, timezone: string): Promise<CreateResult> {
  return createTransaction(ctx, {
    amount: body.amount,
    type: body.type,
    kind: await manualKind(ctx, body),
    counterpartyName: body.counterparty_name,
    counterpartyType: body.counterparty_type,
    categoryId: body.category_id,
    categoryName: body.category,
    brandId: body.brand_id,
    note: body.note,
    transactionAt: body.transaction_at,
    timezone,
    detectedVia: 'manual',
  });
}

/** A client that read the row at `expected` (its `updated_at`) must not overwrite what changed since: 409 `stale`. */
function assertFresh(existing: Pick<TransactionRow, 'updated_at' | 'created_at'>, expected: Instant | undefined): void {
  if (expected && Date.parse(isoUtc(existing.updated_at ?? existing.created_at)) !== expected.ms) throw new StaleError();
}

/**
 * `PATCH /transactions/:id`. Only the fields sent change (an omitted field keeps its value; `null` clears the category or the
 * note), and with `expected_updated_at` a row changed elsewhere meanwhile is a 409 `stale` (checked again inside the write, so two
 * devices cannot both win).
 */
export async function updateTransaction(ctx: TxContext, id: string, body: TransactionPatchBody): Promise<TransactionResponse> {
  const wantsCategory = body.category_id !== undefined || body.category !== undefined;
  const [existing, resolved] = await Promise.all([
    repo.fetchActive(ctx.db, ctx.userId, id),
    wantsCategory ? resolveCategory(ctx, { categoryId: body.category_id, categoryName: body.category }) : Promise.resolve(null),
  ]);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  assertFresh(existing, body.expected_updated_at);

  const type = body.type ?? existing.type;
  const amount = body.amount ?? existing.amount;
  const patch: Record<string, unknown> = {
    // An edit is the user looking at it: whatever the capture doubted is settled.
    needs_review: false,
  };
  if (body.amount !== undefined) patch['amount'] = body.amount;
  if (body.type !== undefined) patch['type'] = body.type;
  if (body.note !== undefined) patch['note'] = body.note;

  // A recurring-scope category may be set only on a row a recurring item posted, and then only in its own
  // direction. A row keeps the category it already has when the client echoes it back unchanged, as long
  // as it still fits the (possibly changed) type.
  if (wantsCategory) {
    if (
      resolved &&
      resolved.scope !== 'spend' &&
      (resolved.id !== String(existing.category_id ?? '').toLowerCase() || !fitsType(resolved.scope, type))
    ) {
      if (!existing.recurring_item_id) throw new ValidationError(RECURRING_ONLY);
      if (!fitsType(resolved.scope, type)) throw new ValidationError(SCOPE_MISMATCH);
    }
    // A name never matches a recurring category (only recurring-posted rows carry one), so an echoed-back
    // name that doesn't resolve keeps such a row's category instead of silently clearing it.
    let categoryId = resolved?.id ?? null;
    if (!resolved && body.category?.trim() && existing.category_id) {
      const current = await resolveCategory(ctx, { categoryId: existing.category_id });
      if (current && current.scope !== 'spend') categoryId = current.id;
    }
    patch['category_id'] = categoryId;
  }

  // How the row counts: an explicit choice wins; otherwise it stays unless the direction no longer fits or the counterparty
  // type changed (an own-account transfer becomes a transfer, and back).
  const counterpartyChanged = Boolean(body.counterparty_type && body.counterparty_type !== existing.counterparty_type);
  const kind: TransactionKind =
    body.kind ??
    (kindFitsType(existing.kind, type) && !counterpartyChanged ? existing.kind : defaultKind(type, body.counterparty_type ?? existing.counterparty_type));
  if (!kindFitsType(kind, type)) throw new ValidationError(KIND_MISMATCH);
  await ensureOffsetsStillFit(ctx, existing, { kind, type, amountCents: decimalToCents(amount) });
  if (kind !== existing.kind) patch['kind'] = kind;
  if (body.counterparty_type) patch['counterparty_type'] = body.counterparty_type;

  const existingName = (existing.counterparty_name ?? '').trim();
  const name = body.counterparty_name === undefined ? existingName : body.counterparty_name.trim();
  if (body.counterparty_name !== undefined) {
    patch['counterparty_name'] = name;
    patch['counterparty_normalized'] = normalizedOrNull(name);
  }
  // The day follows the instant only when the instant moved (an echoed-back time keeps the day it was filed under).
  if (body.transaction_at && body.transaction_at.iso !== existing.transaction_at) {
    if (body.transaction_at.ms !== Date.parse(existing.transaction_at)) assertNotTooFarAhead(body.transaction_at.ms); // an echoed-back stored time is never refused
    const day = dateKey(localDate(await resolveUserTimezone(ctx.db, ctx.userId), body.transaction_at.ms));
    patch['transaction_at'] = body.transaction_at.iso;
    patch['local_date'] = day;
    patch['month_key'] = day.slice(0, 7);
  }

  // A picked brand wins. Otherwise the brand follows the payee name: re-resolved whenever brand_id is sent (the app
  // sends null for a typed name, which may still be a known brand) or the name or type changed; kept otherwise.
  const payeeChanged = (body.counterparty_name !== undefined && name !== existingName) || counterpartyChanged;
  if (body.brand_id !== undefined || payeeChanged) {
    patch['brand_id'] = await pickBrand(ctx.db, body.brand_id, name, body.counterparty_type ?? existing.counterparty_type);
  }

  const guard = body.expected_updated_at ? (existing.updated_at ?? existing.created_at) : undefined;
  const row = await repo.updateForUser(ctx.db, ctx.userId, id, patch, guard);
  if (!row) {
    // Gone, or (with the guard) changed between the read and the write.
    if (guard !== undefined && (await repo.fetchActive(ctx.db, ctx.userId, id))) throw new StaleError();
    throw new NotFoundError(NOT_FOUND);
  }
  await emit(ctx.publish, [changed('transactions', row)]);
  await afterSpendWrite(ctx, [existing, row]);
  return (await enrichRows(ctx, [row]))[0] as TransactionResponse;
}

/**
 * A row with paybacks linked to it cannot change in a way that breaks them: it keeps its direction, a spend stays a spend, a
 * credit stays money received (income or payback, which one is free), and its amount stays at least what is linked. (Unlink
 * first, then edit.)
 */
async function ensureOffsetsStillFit(
  ctx: TxContext,
  existing: TransactionRow,
  next: { kind: TransactionKind; type: TransactionType; amountCents: number },
): Promise<void> {
  if (existing.kind === 'transfer') return;
  const linked = (await repo.offsetTotals(ctx.db, ctx.userId, [existing.id])).get(existing.id) ?? 0;
  if (linked === 0) return;
  if (next.type !== existing.type || next.kind === 'transfer' || (existing.kind === 'spend') !== (next.kind === 'spend')) {
    throw new ValidationError('Unlink the paybacks of this transaction before changing its type or kind.');
  }
  if (next.amountCents < linked) throw new ValidationError('The amount cannot be less than the paybacks already linked to this transaction.');
}

/**
 * `DELETE /transactions/:id` (a soft delete: `restoreTransaction` brings it back, the hourly purge removes it after 30 days).
 * With `expected_updated_at` a row changed elsewhere meanwhile is a 409 `stale`. What the row stood for is released: a recurring
 * posting leaves a skip (so the poster does not post that occurrence again) and a payment toward a reminder is withdrawn.
 */
export async function deleteTransaction(ctx: TxContext, id: string, expected?: Instant): Promise<void> {
  let guard: string | undefined;
  if (expected) {
    const existing = await repo.fetchActive(ctx.db, ctx.userId, id);
    if (!existing) throw new NotFoundError(NOT_FOUND);
    assertFresh(existing, expected);
    guard = existing.updated_at ?? existing.created_at;
  }
  const deletedRow = await repo.softDeleteRow(ctx.db, ctx.userId, id, guard);
  if (!deletedRow) {
    if (guard !== undefined && (await repo.fetchActive(ctx.db, ctx.userId, id))) throw new StaleError();
    throw new NotFoundError(NOT_FOUND);
  }
  if (deletedRow.recurring_item_id && deletedRow.recurring_occurrence) {
    await addSkip(ctx.db, ctx.userId, deletedRow.recurring_item_id, deletedRow.recurring_occurrence);
  }
  await releaseTransaction(ctx.db, ctx.userId, deletedRow.id);
  // A soft delete reaches the app as an UPDATE with `deleted_at` set (what the app's handlers expect).
  await emit(ctx.publish, [changed('transactions', deletedRow)]);
  // Its own month, and the months of whatever it was linked to: their offsets are inert now.
  const partners = await repo.offsetPartners(ctx.db, ctx.userId, id);
  await afterSpendWrite(ctx, [deletedRow, ...partners]);
}

/**
 * `POST /transactions/:id/restore`: bring a deleted transaction back (the app's undo). Its links to paybacks come back with it, its
 * recurring occurrence is taken again, and the budget alerts of its months are reconciled like after any write. A row that is
 * already live is returned as it is (a retried undo); a purged or unknown id is a 404.
 */
export async function restoreTransaction(ctx: TxContext, id: string): Promise<TransactionResponse> {
  const existing = await repo.fetchAny(ctx.db, ctx.userId, id);
  if (!existing) throw new NotFoundError(NOT_FOUND);
  if (!existing.deleted_at) return (await enrichRows(ctx, [existing]))[0] as TransactionResponse;
  let row: TransactionRow | null;
  try {
    row = await repo.restoreRow(ctx.db, ctx.userId, id);
  } catch (err) {
    if (isUniqueViolation(err)) throw new ConflictError('That recurring occurrence has a transaction again. Remove it to restore this one.');
    throw err;
  }
  if (!row) throw new NotFoundError(NOT_FOUND);
  if (row.recurring_item_id && row.recurring_occurrence) await removeSkip(ctx.db, ctx.userId, row.recurring_item_id, row.recurring_occurrence);
  // Links to rows that changed while this one was deleted may not fit any more: keep only the ones that do.
  await repo.dropOverfullOffsets(ctx.db, ctx.userId, row);
  await emit(ctx.publish, [changed('transactions', row)]);
  const partners = await repo.offsetPartners(ctx.db, ctx.userId, id);
  await afterSpendWrite(ctx, [row, ...partners]);
  return (await enrichRows(ctx, [row]))[0] as TransactionResponse;
}
