import { all, chunks, first, newId, nowIso, placeholders, run } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { decimalToCents, formatCents } from '../../core/decimal';
import { normalizeCounterparty, payeeKey } from './dedupe';
import { DETAIL_COLUMNS, LIST_COLUMNS } from './schemas';
import type { TransactionRow } from './schemas';

/** Raw `transactions` row: money in integer cents. */
export type TransactionDbRow = Omit<TransactionRow, 'amount'> & { amount: number };

export function toRow(row: TransactionDbRow): TransactionRow {
  return { ...row, amount: formatCents(row.amount) };
}

export interface ListFilters {
  /** Inclusive lower bound (ISO). */
  from?: string | undefined;
  /** Exclusive upper bound (ISO). */
  to?: string | undefined;
  categoryId?: string | undefined;
  payee?: string | undefined;
  /** The recurring item that posted the rows (uses `transactions_recurring_idx`). */
  recurringItemId?: string | undefined;
}

export interface PayeeLikePatterns {
  /** `LIKE` patterns tried against both `counterparty_normalized` and `counterparty_name`. */
  both: string[];
  /** Extra patterns tried against `counterparty_normalized` only. */
  normalized: string[];
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * `LIKE` patterns for the C3 payee filter: case-insensitive "contains" on the normalized payee and
 * on the display name (SQLite `LIKE` ignores ASCII case). Reserved characters are stripped
 * (`" \ * %`) and `_` is escaped; over-matching is acceptable because the client re-applies the
 * exact match.
 */
export function payeeLikePatterns(payee: string): PayeeLikePatterns | null {
  const clean = payee.replace(/[\\"*%]/g, '').trim().slice(0, 100);
  if (!clean) return null;
  const normalized = normalizeCounterparty(clean);
  return {
    both: [`%${escapeLike(clean)}%`],
    normalized: normalized && normalized !== clean.toLowerCase() ? [`%${escapeLike(normalized)}%`] : [],
  };
}

/** Up to `limit` rows (callers ask for one extra to learn whether more exist), newest first. */
export async function listPage(
  db: Db,
  userId: string,
  opts: { filters: ListFilters; limit: number; offset: number },
): Promise<TransactionRow[]> {
  const { filters } = opts;
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params: SqlParam[] = [userId];
  if (filters.from) {
    where.push('transaction_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('transaction_at < ?');
    params.push(filters.to);
  }
  if (filters.categoryId) {
    where.push('category_id = ?');
    params.push(filters.categoryId.toLowerCase());
  }
  if (filters.recurringItemId) {
    where.push('recurring_item_id = ?');
    params.push(filters.recurringItemId.toLowerCase());
  }
  const patterns = filters.payee ? payeeLikePatterns(filters.payee) : null;
  if (patterns) {
    const ors: string[] = [];
    for (const p of patterns.both) {
      ors.push("counterparty_normalized LIKE ? ESCAPE '\\'", "counterparty_name LIKE ? ESCAPE '\\'");
      params.push(p, p);
    }
    for (const p of patterns.normalized) {
      ors.push("counterparty_normalized LIKE ? ESCAPE '\\'");
      params.push(p);
    }
    where.push(`(${ors.join(' OR ')})`);
  }
  params.push(opts.limit, opts.offset);
  const rows = await all<TransactionDbRow>(
    db,
    `SELECT ${LIST_COLUMNS} FROM transactions WHERE ${where.join(' AND ')}
     ORDER BY transaction_at DESC, id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map(toRow);
}

export async function fetchActive(db: Db, userId: string, id: string): Promise<TransactionRow | null> {
  const row = await first<TransactionDbRow>(
    db,
    `SELECT ${DETAIL_COLUMNS} FROM transactions WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [id.toLowerCase(), userId],
  );
  return row ? toRow(row) : null;
}

/** The live row with this idempotency identity (`job:<job id>` for a capture), or null. */
export async function findByPaymentHash(db: Db, userId: string, paymentHash: string): Promise<TransactionRow | null> {
  const row = await first<TransactionDbRow>(
    db,
    `SELECT ${DETAIL_COLUMNS} FROM transactions WHERE user_id = ? AND payment_hash = ? AND deleted_at IS NULL LIMIT 1`,
    [userId, paymentHash],
  );
  return row ? toRow(row) : null;
}

/** The live row standing for a recurring item's occurrence (`YYYY-MM-DD`), or null. */
export async function findByOccurrence(db: Db, userId: string, itemId: string, occurrence: string): Promise<TransactionRow | null> {
  const row = await first<TransactionDbRow>(
    db,
    `SELECT ${DETAIL_COLUMNS} FROM transactions
     WHERE user_id = ?1 AND recurring_item_id = ?2 AND deleted_at IS NULL
       AND (recurring_occurrence = ?3 OR (recurring_occurrence IS NULL AND payment_hash = 'recurring:' || ?2 || ':' || ?3)) LIMIT 1`,
    [userId, itemId, occurrence],
  );
  return row ? toRow(row) : null;
}

/**
 * A live row that looks like the same payment: same type, amount and payee on the same local day. Only a suggestion for the
 * caller ("possible duplicate"); nothing is merged or blocked. `excludeId` leaves out a row (the one being edited).
 */
export async function findPossibleDuplicate(
  db: Db,
  userId: string,
  probe: { type: string; amountCents: number; payeeKey: string; localDate: string; excludeId?: string | undefined },
): Promise<string | null> {
  const row = await first<{ id: string }>(
    db,
    `SELECT id FROM transactions
     WHERE user_id = ? AND deleted_at IS NULL AND payee_key = ? AND local_date = ? AND type = ? AND amount = ? AND id <> ?
     ORDER BY created_at DESC LIMIT 1`,
    [userId, probe.payeeKey, probe.localDate, probe.type, probe.amountCents, (probe.excludeId ?? '').toLowerCase()],
  );
  return row?.id ?? null;
}

/** The columns a caller may write. `amount` is a decimal string ("250.50"); the repository stores cents. */
export interface NewTransactionRow {
  user_id: string;
  amount: string;
  type: string;
  kind: string;
  note: string | null;
  detected_via: string;
  transaction_at: string;
  /** The row's calendar day in the user's timezone (`YYYY-MM-DD`) and its month (`YYYY-MM`). */
  local_date: string;
  month_key: string;
  category_id: string | null;
  receipt_url: string | null;
  voice_url: string | null;
  counterparty_name: string;
  counterparty_normalized: string | null;
  /** Idempotency identity (`job:<id>`), null for manual and recurring rows. */
  payment_hash: string | null;
  counterparty_type?: string;
  /** Set by the recurring poster / link only: the item and the period (its due date) the row stands for. */
  recurring_item_id?: string | null;
  recurring_occurrence?: string | null;
  brand_id?: string | null;
  needs_review?: boolean;
}

/**
 * Insert one row (`payee_key` is derived here) and return the stored row. A clash on an idempotency identity (the job hash, the
 * recurring occurrence) throws a unique violation.
 */
export async function insertTransactionRow(db: Db, row: NewTransactionRow): Promise<TransactionRow> {
  const id = newId();
  const now = nowIso();
  const stored = await first<TransactionDbRow>(
    db,
    `INSERT INTO transactions
       (id, user_id, amount, type, kind, note, detected_via, transaction_at, local_date, month_key, created_at, updated_at, category_id,
        receipt_url, voice_url, counterparty_name, counterparty_type, counterparty_normalized, payment_hash, payee_key,
        recurring_item_id, recurring_occurrence, brand_id, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${DETAIL_COLUMNS}`,
    [
      id,
      row.user_id,
      decimalToCents(row.amount),
      row.type,
      row.kind,
      row.note,
      row.detected_via,
      row.transaction_at,
      row.local_date,
      row.month_key,
      now,
      now,
      row.category_id,
      row.receipt_url,
      row.voice_url,
      row.counterparty_name,
      row.counterparty_type ?? 'merchant',
      row.counterparty_normalized,
      row.payment_hash,
      payeeKey(row.counterparty_normalized, row.counterparty_name),
      row.recurring_item_id ?? null,
      row.recurring_occurrence ?? null,
      row.brand_id ?? null,
      row.needs_review ? 1 : 0,
    ],
  );
  if (!stored) throw new Error('transaction insert returned no row');
  return toRow(stored);
}

const PATCHABLE = new Set([
  'amount',
  'type',
  'kind',
  'note',
  'detected_via',
  'transaction_at',
  'local_date',
  'month_key',
  'category_id',
  'receipt_url',
  'voice_url',
  'counterparty_name',
  'counterparty_type',
  'counterparty_normalized',
  'brand_id',
  'needs_review',
  'recurring_item_id',
  'recurring_occurrence',
]);

/**
 * Update an active row owned by the user and return it; null when it does not exist (or is deleted), or, with `onlyIfUpdatedAt`
 * (the raw `updated_at` the caller read), when it changed since. Changing the payee fields recomputes `payee_key`.
 */
export async function updateForUser(
  db: Db,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
  onlyIfUpdatedAt?: string,
): Promise<TransactionRow | null> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [column, value] of Object.entries(patch)) {
    if (!PATCHABLE.has(column)) throw new Error(`Column '${column}' is not patchable.`);
    sets.push(`${column} = ?`);
    params.push(column === 'amount' ? decimalToCents(value as string) : typeof value === 'boolean' ? (value ? 1 : 0) : ((value ?? null) as SqlParam));
  }
  if ('counterparty_name' in patch || 'counterparty_normalized' in patch) {
    sets.push('payee_key = ?');
    params.push(payeeKey(patch['counterparty_normalized'] as string | null, patch['counterparty_name'] as string | null));
  }
  sets.push('updated_at = ?');
  params.push(nowIso(), id.toLowerCase(), userId);
  if (onlyIfUpdatedAt !== undefined) params.push(onlyIfUpdatedAt);
  const row = await first<TransactionDbRow>(
    db,
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL${onlyIfUpdatedAt === undefined ? '' : ' AND updated_at = ?'} RETURNING ${DETAIL_COLUMNS}`,
    params,
  );
  return row ? toRow(row) : null;
}

export async function softDelete(db: Db, userId: string, id: string): Promise<boolean> {
  return (await softDeleteRow(db, userId, id)) !== null;
}

/**
 * `softDelete`, returning the row as stored after the delete (null when there was nothing to delete, or, with `onlyIfUpdatedAt`,
 * when the row changed since the caller read it).
 */
export async function softDeleteRow(db: Db, userId: string, id: string, onlyIfUpdatedAt?: string): Promise<TransactionRow | null> {
  const now = nowIso();
  const row = await first<TransactionDbRow>(
    db,
    `UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL${onlyIfUpdatedAt === undefined ? '' : ' AND updated_at = ?'} RETURNING ${DETAIL_COLUMNS}`,
    [now, now, id.toLowerCase(), userId, ...(onlyIfUpdatedAt === undefined ? [] : [onlyIfUpdatedAt])],
  );
  return row ? toRow(row) : null;
}

/** The user's row whether live or soft-deleted (null when it never existed or was purged). */
export async function fetchAny(db: Db, userId: string, id: string): Promise<TransactionRow | null> {
  const row = await first<TransactionDbRow>(db, `SELECT ${DETAIL_COLUMNS} FROM transactions WHERE id = ? AND user_id = ? LIMIT 1`, [id.toLowerCase(), userId]);
  return row ? toRow(row) : null;
}

/** Bring a soft-deleted row back (null when it is not deleted, or gone). A taken recurring occurrence is a unique violation. */
export async function restoreRow(db: Db, userId: string, id: string): Promise<TransactionRow | null> {
  const row = await first<TransactionDbRow>(
    db,
    `UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL RETURNING ${DETAIL_COLUMNS}`,
    [nowIso(), id.toLowerCase(), userId],
  );
  return row ? toRow(row) : null;
}

/** Sum (cents) of the live paybacks linked to each given row, as a map (rows without any are absent). */
export async function offsetTotals(db: Db, userId: string, ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const part of chunks(ids, 45)) {
    const marks = placeholders(part.length);
    const lowered = part.map((id) => id.toLowerCase());
    const rows = await all<{ id: string; total: number }>(
      db,
      `SELECT o.debit_id AS id, SUM(o.amount) AS total FROM transaction_offsets o
         JOIN transactions p ON p.id = o.credit_id AND p.deleted_at IS NULL
         WHERE o.user_id = ? AND o.debit_id IN (${marks}) GROUP BY o.debit_id
       UNION ALL
       SELECT o.credit_id AS id, SUM(o.amount) AS total FROM transaction_offsets o
         JOIN transactions p ON p.id = o.debit_id AND p.deleted_at IS NULL
         WHERE o.user_id = ? AND o.credit_id IN (${marks}) GROUP BY o.credit_id`,
      [userId, ...lowered, userId, ...lowered],
    );
    for (const r of rows) out.set(r.id, (out.get(r.id) ?? 0) + r.total);
  }
  return out;
}

/**
 * After a restore: a link whose other side was edited (or linked elsewhere) while this row was deleted can now overfill one side.
 * Drops such links, newest first, until both sides fit again; the ledger would clamp anyway, this keeps the stored links honest.
 * Returns how many links were dropped.
 */
export async function dropOverfullOffsets(db: Db, userId: string, row: Pick<TransactionRow, 'id' | 'amount'>): Promise<number> {
  const id = row.id.toLowerCase();
  const links = await all<{ id: string; amount: number; partner: string }>(
    db,
    `SELECT o.id AS id, o.amount AS amount, p.id AS partner FROM transaction_offsets o
     JOIN transactions p ON p.id = CASE WHEN o.credit_id = ?1 THEN o.debit_id ELSE o.credit_id END AND p.deleted_at IS NULL
     WHERE o.user_id = ?2 AND (o.credit_id = ?1 OR o.debit_id = ?1) ORDER BY o.created_at DESC, o.id DESC`,
    [id, userId],
  );
  if (links.length === 0) return 0;
  const partnerIds = [...new Set(links.map((l) => l.partner))];
  const [totals, partners] = await Promise.all([offsetTotals(db, userId, partnerIds), fetchActiveMany(db, userId, partnerIds)]);
  const limits = new Map(partners.map((p) => [p.id.toLowerCase(), decimalToCents(p.amount)]));
  let own = links.reduce((sum, l) => sum + l.amount, 0);
  const ownLimit = decimalToCents(row.amount);
  let dropped = 0;
  for (const l of links) {
    const partnerTotal = totals.get(l.partner) ?? 0;
    if (own <= ownLimit && partnerTotal <= (limits.get(l.partner) ?? 0)) continue;
    await run(db, 'DELETE FROM transaction_offsets WHERE id = ? AND user_id = ?', [l.id, userId]);
    own -= l.amount;
    totals.set(l.partner, partnerTotal - l.amount);
    dropped += 1;
  }
  return dropped;
}

/** The live rows linked to `id` by an offset (either side), for the months a change to `id` also moves. */
export async function offsetPartners(db: Db, userId: string, id: string): Promise<Pick<TransactionRow, 'kind' | 'month_key' | 'transaction_at'>[]> {
  const lowered = id.toLowerCase();
  return all<Pick<TransactionRow, 'kind' | 'month_key' | 'transaction_at'>>(
    db,
    `SELECT p.kind AS kind, p.month_key AS month_key, p.transaction_at AS transaction_at
     FROM transaction_offsets o
     JOIN transactions p ON p.id = CASE WHEN o.credit_id = ? THEN o.debit_id ELSE o.credit_id END AND p.deleted_at IS NULL
     WHERE o.user_id = ? AND (o.credit_id = ? OR o.debit_id = ?)`,
    [lowered, userId, lowered, lowered],
  );
}

/** The live rows among `ids` owned by the user (any order). */
export async function fetchActiveMany(db: Db, userId: string, ids: readonly string[]): Promise<TransactionRow[]> {
  const out: TransactionRow[] = [];
  for (const part of chunks(ids, 80)) {
    const rows = await all<TransactionDbRow>(
      db,
      `SELECT ${DETAIL_COLUMNS} FROM transactions WHERE user_id = ? AND deleted_at IS NULL AND id IN (${placeholders(part.length)})`,
      [userId, ...part.map((id) => id.toLowerCase())],
    );
    out.push(...rows.map(toRow));
  }
  return out;
}
