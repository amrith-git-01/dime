import { all, first, newId, nowIso, run, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import type { RecurringRow } from './schemas';

/** Every query is scoped by `user_id`, except the cron's `listDue` (it serves all users, then acts per item owner). */
const COLUMNS =
  'id,user_id,kind,name,amount,category_id,cadence,day_of_month,month_of_year,timezone,next_due_date,active,note,remind_lead_days,next_remind_at,created_at,updated_at';

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
       (id, user_id, kind, name, amount, category_id, cadence, day_of_month, month_of_year, timezone, next_due_date, active, note, remind_lead_days, next_remind_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    [newId(), row.user_id, row.kind, row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.active, row.note, row.remind_lead_days, row.next_remind_at, now, now],
  );
  if (!stored) throw new Error('recurring insert returned no row');
  return stored;
}

/** Overwrite the editable columns of the user's item (the service merges the patch first). Null = not found. */
export function update(db: Db, userId: string, row: RecurringRow): Promise<RecurringRow | null> {
  return first<RecurringRow>(
    db,
    `UPDATE recurring_items SET name = ?, amount = ?, category_id = ?, cadence = ?, day_of_month = ?, month_of_year = ?,
       timezone = ?, next_due_date = ?, active = ?, note = ?, remind_lead_days = ?, next_remind_at = ?, updated_at = ?
     WHERE user_id = ? AND id = ? RETURNING ${COLUMNS}`,
    [row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.active, row.note, row.remind_lead_days, row.next_remind_at, nowIso(), userId, row.id],
  );
}

/** Deletes the item; its posted transactions stay (their `recurring_item_id` becomes NULL by the foreign key). */
export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  return (await run(db, 'DELETE FROM recurring_items WHERE user_id = ? AND id = ?', [userId, id])) > 0;
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

export interface PostedRow {
  id: string;
  recurring_item_id: string;
  amount: number;
  transaction_at: string;
  deleted_at: string | null;
}

/** Every transaction a recurring item posted in `[from, to)`, deleted ones included (a deleted one marks a skipped occurrence). */
export function listPostedIn(db: Db, userId: string, range: { from: string; to: string }): Promise<PostedRow[]> {
  return all<PostedRow>(
    db,
    `SELECT id, recurring_item_id, amount, transaction_at, deleted_at FROM transactions
     WHERE user_id = ? AND recurring_item_id IS NOT NULL AND transaction_at >= ? AND transaction_at < ?`,
    [userId, range.from, range.to],
  );
}

/** Active items whose local due date is on or before `maxDate` (a UTC-date upper bound), oldest first. */
export function listDue(db: Db, maxDate: string, limit: number): Promise<RecurringRow[]> {
  return all<RecurringRow>(
    db,
    `SELECT ${COLUMNS} FROM recurring_items WHERE active = 1 AND next_due_date <= ? ORDER BY next_due_date, id LIMIT ?`,
    [maxDate, limit],
  );
}

/**
 * Move an item to its next period, only if it is still on the period just posted (a concurrent run or edit wins).
 * `nextRemindAt` is the lead-day reminder instant of the NEW period (null = reminders off or none left).
 */
export async function advance(db: Db, id: string, fromDate: string, toDate: string, nextRemindAt: string | null = null): Promise<boolean> {
  return (
    (await run(db, 'UPDATE recurring_items SET next_due_date = ?, next_remind_at = ?, updated_at = ? WHERE id = ? AND next_due_date = ?', [toDate, nextRemindAt, nowIso(), id, fromDate])) > 0
  );
}

/** Active items with lead-day reminders whose next reminder instant has arrived, oldest first (all users: the reminders cron). */
export function listRemindDue(db: Db, nowIsoText: string, limit: number): Promise<RecurringRow[]> {
  return all<RecurringRow>(
    db,
    `SELECT ${COLUMNS} FROM recurring_items WHERE active = 1 AND next_remind_at IS NOT NULL AND next_remind_at <= ? ORDER BY next_remind_at, id LIMIT ?`,
    [nowIsoText, limit],
  );
}

/** The reminders cron's next instant for an item, only if it is still on the one it picked (an edit or the poster wins). */
export async function setNextRemind(db: Db, id: string, expected: string, next: string | null): Promise<boolean> {
  return (await run(db, 'UPDATE recurring_items SET next_remind_at = ? WHERE id = ? AND next_remind_at = ?', [next, id, expected])) > 0;
}

/** The user's active items with lead-day reminders on, for re-planning after a reminder-settings change. */
export function listRemindableForUser(db: Db, userId: string): Promise<RecurringRow[]> {
  return all<RecurringRow>(db, `SELECT ${COLUMNS} FROM recurring_items WHERE user_id = ? AND active = 1 AND remind_lead_days IS NOT NULL`, [userId]);
}

/** A statement for `db.batch` that re-plans one item's next reminder instant. */
export function setNextRemindStatement(db: Db, userId: string, id: string, next: string | null): D1PreparedStatement {
  return stmt(db, 'UPDATE recurring_items SET next_remind_at = ? WHERE user_id = ? AND id = ?', [next, userId, id]);
}

/** How many items are due a reminder (the cron logs what its per-tick cap left for the next run). */
export async function countRemindDue(db: Db, nowIsoText: string): Promise<number> {
  const row = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recurring_items WHERE active = 1 AND next_remind_at IS NOT NULL AND next_remind_at <= ?', [nowIsoText]);
  return row?.n ?? 0;
}
