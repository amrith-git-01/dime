import { all, first, newId, nowIso } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { decimalToCents, formatCents } from '../../core/decimal';
import { normalizeCounterparty, payeeKey } from './dedupe';
import type { AmountTypeAtRow, PeriodSummary } from './aggregates';
import { DETAIL_COLUMNS, LIST_COLUMNS } from './schemas';
import type { TransactionRow } from './schemas';

/** Raw `transactions` row: money in integer cents. */
type TransactionDbRow = Omit<TransactionRow, 'amount'> & { amount: number };

function toRow(row: TransactionDbRow): TransactionRow {
  return { ...row, amount: formatCents(row.amount) };
}

export interface ListFilters {
  /** Inclusive lower bound (ISO). */
  from?: string | undefined;
  /** Exclusive upper bound (ISO). */
  to?: string | undefined;
  categoryId?: string | undefined;
  payee?: string | undefined;
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

export async function findByPaymentHash(db: Db, userId: string, paymentHash: string): Promise<TransactionRow | null> {
  const row = await first<TransactionDbRow>(
    db,
    `SELECT ${DETAIL_COLUMNS} FROM transactions WHERE user_id = ? AND payment_hash = ? AND deleted_at IS NULL LIMIT 1`,
    [userId, paymentHash],
  );
  return row ? toRow(row) : null;
}

/** The columns a caller may write. `amount` is a decimal string ("250.50"); the repository stores cents. */
export interface NewTransactionRow {
  user_id: string;
  amount: string;
  type: string;
  note: string | null;
  detected_via: string;
  transaction_at: string;
  category_id: string | null;
  receipt_url: string | null;
  voice_url: string | null;
  counterparty_name: string;
  counterparty_normalized: string | null;
  payment_hash: string;
  counterparty_type?: string;
}

/** Insert one row (`payee_key` is derived here); returns its id. A `(user_id, payment_hash)` clash throws a unique violation. */
export async function insertTransaction(db: Db, row: NewTransactionRow): Promise<string> {
  return (await insertTransactionRow(db, row)).id;
}

/** `insertTransaction`, returning the stored row (for the live-update broadcast). */
export async function insertTransactionRow(db: Db, row: NewTransactionRow): Promise<TransactionRow> {
  const id = newId();
  const now = nowIso();
  const stored = await first<TransactionDbRow>(
    db,
    `INSERT INTO transactions
       (id, user_id, amount, type, note, detected_via, transaction_at, created_at, updated_at, category_id,
        receipt_url, voice_url, counterparty_name, counterparty_type, counterparty_normalized, payment_hash, payee_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${DETAIL_COLUMNS}`,
    [
      id,
      row.user_id,
      decimalToCents(row.amount),
      row.type,
      row.note,
      row.detected_via,
      row.transaction_at,
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
    ],
  );
  if (!stored) throw new Error('transaction insert returned no row');
  return toRow(stored);
}

const PATCHABLE = new Set([
  'amount',
  'type',
  'note',
  'detected_via',
  'transaction_at',
  'category_id',
  'receipt_url',
  'voice_url',
  'counterparty_name',
  'counterparty_type',
  'counterparty_normalized',
  'payment_hash',
]);

/**
 * Update an active row owned by the user and return it; null when it does not exist (or is deleted).
 * Changing the payee fields recomputes `payee_key`.
 */
export async function updateForUser(
  db: Db,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<TransactionRow | null> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const [column, value] of Object.entries(patch)) {
    if (!PATCHABLE.has(column)) throw new Error(`Column '${column}' is not patchable.`);
    sets.push(`${column} = ?`);
    params.push(column === 'amount' ? decimalToCents(value as string) : ((value ?? null) as SqlParam));
  }
  if ('counterparty_name' in patch || 'counterparty_normalized' in patch) {
    sets.push('payee_key = ?');
    params.push(payeeKey(patch['counterparty_normalized'] as string | null, patch['counterparty_name'] as string | null));
  }
  sets.push('updated_at = ?');
  params.push(nowIso(), id.toLowerCase(), userId);
  const row = await first<TransactionDbRow>(
    db,
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING ${DETAIL_COLUMNS}`,
    params,
  );
  return row ? toRow(row) : null;
}

export async function softDelete(db: Db, userId: string, id: string): Promise<boolean> {
  return (await softDeleteRow(db, userId, id)) !== null;
}

/** `softDelete`, returning the row as stored after the delete (null when there was nothing to delete). */
export async function softDeleteRow(db: Db, userId: string, id: string): Promise<TransactionRow | null> {
  const now = nowIso();
  const row = await first<TransactionDbRow>(
    db,
    `UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL RETURNING ${DETAIL_COLUMNS}`,
    [now, now, id.toLowerCase(), userId],
  );
  return row ? toRow(row) : null;
}

/** Largest single debits in `[from, to)` (newest first on ties). */
export async function topDebits(
  db: Db,
  userId: string,
  range: { from: string; to: string },
  limit: number,
): Promise<TransactionRow[]> {
  const rows = await all<TransactionDbRow>(
    db,
    `SELECT ${LIST_COLUMNS} FROM transactions
     WHERE user_id = ? AND type = 'debit' AND deleted_at IS NULL AND transaction_at >= ? AND transaction_at < ?
     ORDER BY amount DESC, transaction_at DESC LIMIT ?`,
    [userId, range.from, range.to, limit],
  );
  return rows.map(toRow);
}

/* ----------------------------------------------------------------------------------------------
 * Aggregates (single GROUP BY queries)
 * -------------------------------------------------------------------------------------------- */

/** Credit/debit totals, row count and debit-by-category over the half-open `[from, to)`. */
export async function periodSummary(db: Db, userId: string, range: { from: string; to: string }): Promise<PeriodSummary> {
  const rows = await all<{ type: string; category_id: string | null; total: number; n: number }>(
    db,
    `SELECT type, category_id, SUM(amount) AS total, COUNT(*) AS n FROM transactions
     WHERE user_id = ? AND deleted_at IS NULL AND transaction_at >= ? AND transaction_at < ?
     GROUP BY type, category_id`,
    [userId, range.from, range.to],
  );
  const summary: PeriodSummary = { creditCents: 0, debitCents: 0, count: 0, debitByCategory: new Map() };
  for (const row of rows) {
    summary.count += row.n;
    if (row.type === 'credit') summary.creditCents += row.total;
    else if (row.type === 'debit') {
      summary.debitCents += row.total;
      const key = row.category_id ?? '';
      summary.debitByCategory.set(key, (summary.debitByCategory.get(key) ?? 0) + row.total);
    }
  }
  return summary;
}

/**
 * Amount / type / instant of every row in `[from, to)`, for the local-day bucketing in
 * `dayTotalsFromRows` (SQLite has no IANA timezone support, so days are cut in TypeScript).
 */
export async function fetchAmountTypeAtRows(
  db: Db,
  userId: string,
  range: { from: string; to: string },
): Promise<AmountTypeAtRow[]> {
  const rows = await all<{ amount: number; type: string; transaction_at: string }>(
    db,
    `SELECT amount, type, transaction_at FROM transactions
     WHERE user_id = ? AND deleted_at IS NULL AND transaction_at >= ? AND transaction_at < ?`,
    [userId, range.from, range.to],
  );
  return rows.map((r) => ({ amount: formatCents(r.amount), type: r.type, transaction_at: r.transaction_at }));
}

export interface PayeeRow {
  type: 'debit' | 'credit';
  payee_key: string;
  display_name: string;
  total_cents: number;
  count: number;
}

/**
 * Per (type, payee) totals and counts. `display_name` is the name of the OLDEST row of the group
 * that has a non-empty name ('Unknown' when none). Ordered by type, then total descending (ties:
 * most recent transaction first).
 */
export async function payeeTotals(db: Db, userId: string, range: { from: string; to: string }): Promise<PayeeRow[]> {
  const rows = await all<{ type: 'debit' | 'credit'; payee_key: string; display_name: string; total: number; n: number }>(
    db,
    `WITH src AS (
       SELECT type, payee_key, amount, transaction_at, NULLIF(TRIM(counterparty_name), '') AS pname
       FROM transactions
       WHERE user_id = ? AND deleted_at IS NULL AND transaction_at >= ? AND transaction_at < ?
     )
     SELECT type, payee_key,
            COALESCE((SELECT s2.pname FROM src s2
                      WHERE s2.type = src.type AND s2.payee_key = src.payee_key AND s2.pname IS NOT NULL
                      ORDER BY s2.transaction_at ASC LIMIT 1), 'Unknown') AS display_name,
            SUM(amount) AS total, COUNT(*) AS n
     FROM src
     GROUP BY type, payee_key
     ORDER BY type, total DESC, MAX(transaction_at) DESC, payee_key`,
    [userId, range.from, range.to],
  );
  return rows.map((r) => ({
    type: r.type,
    payee_key: r.payee_key,
    display_name: r.display_name,
    total_cents: r.total,
    count: r.n,
  }));
}
