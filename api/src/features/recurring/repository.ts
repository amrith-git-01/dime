import { all, first, newId, nowIso, run } from '../../core/db';
import type { Db } from '../../core/db';
import type { RecurringRow } from './schemas';

/** Every query is scoped by `user_id`, except the cron's `listDue` (it serves all users, then acts per item owner). */
const COLUMNS =
  'id,user_id,kind,name,amount,category_id,cadence,day_of_month,month_of_year,timezone,next_due_date,active,note,created_at,updated_at';

export const MAX_ITEMS_PER_USER = 100;

export function listForUser(db: Db, userId: string): Promise<RecurringRow[]> {
  return all<RecurringRow>(db, `SELECT ${COLUMNS} FROM recurring_items WHERE user_id = ? ORDER BY kind, next_due_date, name COLLATE NOCASE`, [userId]);
}

export function fetchForUser(db: Db, userId: string, id: string): Promise<RecurringRow | null> {
  return first<RecurringRow>(db, `SELECT ${COLUMNS} FROM recurring_items WHERE user_id = ? AND id = ?`, [userId, id]);
}

export async function countForUser(db: Db, userId: string): Promise<number> {
  const row = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recurring_items WHERE user_id = ?', [userId]);
  return row?.n ?? 0;
}

export type NewRecurring = Omit<RecurringRow, 'id' | 'created_at' | 'updated_at'>;

export async function insert(db: Db, row: NewRecurring): Promise<RecurringRow> {
  const now = nowIso();
  const stored = await first<RecurringRow>(
    db,
    `INSERT INTO recurring_items
       (id, user_id, kind, name, amount, category_id, cadence, day_of_month, month_of_year, timezone, next_due_date, active, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    [newId(), row.user_id, row.kind, row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.active, row.note, now, now],
  );
  if (!stored) throw new Error('recurring insert returned no row');
  return stored;
}

/** Overwrite the editable columns of the user's item (the service merges the patch first). Null = not found. */
export function update(db: Db, userId: string, row: RecurringRow): Promise<RecurringRow | null> {
  return first<RecurringRow>(
    db,
    `UPDATE recurring_items SET name = ?, amount = ?, category_id = ?, cadence = ?, day_of_month = ?, month_of_year = ?,
       timezone = ?, next_due_date = ?, active = ?, note = ?, updated_at = ?
     WHERE user_id = ? AND id = ? RETURNING ${COLUMNS}`,
    [row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.active, row.note, nowIso(), userId, row.id],
  );
}

/** Deletes the item; its posted transactions stay (their `recurring_item_id` becomes NULL by the foreign key). */
export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  return (await run(db, 'DELETE FROM recurring_items WHERE user_id = ? AND id = ?', [userId, id])) > 0;
}

/** The system "Income" category (default for income items). */
export async function incomeCategoryId(db: Db): Promise<string | null> {
  const row = await first<{ id: string }>(db, "SELECT id FROM categories WHERE is_system = 1 AND name = 'Income' LIMIT 1");
  return row?.id ?? null;
}

/** True when the item already produced a transaction (deleted or not) inside `[from, to)`: that period is done. */
export async function hasPostedIn(db: Db, itemId: string, range: { from: string; to: string }): Promise<boolean> {
  const row = await first<{ x: number }>(
    db,
    'SELECT 1 AS x FROM transactions WHERE recurring_item_id = ? AND transaction_at >= ? AND transaction_at < ? LIMIT 1',
    [itemId, range.from, range.to],
  );
  return row !== null;
}

/** Active items whose local due date is on or before `maxDate` (a UTC-date upper bound), oldest first. */
export function listDue(db: Db, maxDate: string, limit: number): Promise<RecurringRow[]> {
  return all<RecurringRow>(
    db,
    `SELECT ${COLUMNS} FROM recurring_items WHERE active = 1 AND next_due_date <= ? ORDER BY next_due_date, id LIMIT ?`,
    [maxDate, limit],
  );
}

/** Move an item to its next period, only if it is still on the period just posted (a concurrent run or edit wins). */
export async function advance(db: Db, id: string, fromDate: string, toDate: string): Promise<boolean> {
  return (await run(db, 'UPDATE recurring_items SET next_due_date = ?, updated_at = ? WHERE id = ? AND next_due_date = ?', [toDate, nowIso(), id, fromDate])) > 0;
}
