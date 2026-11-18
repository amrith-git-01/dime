import { all, first, newId, nowIso, run, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import type { RecurringRow } from './schemas';

/** Every query is scoped by `user_id`, except the cron's `listDue` (it serves all users, then acts per item owner). */
const COLUMNS =
  'id,user_id,kind,name,amount,category_id,cadence,day_of_month,month_of_year,timezone,next_due_date,starts_on,active,note,remind_lead_days,next_remind_at,counts_toward_budget,created_at,updated_at';

export const MAX_ITEMS_PER_USER = 100;

/**
 * The occurrence an older Worker named only in `payment_hash` (`recurring:<item uuid>:<YYYY-MM-DD>`): its row can have no
 * `recurring_occurrence` until the migration's trigger or this read catches up (see migration 0017).
 */
export const LEGACY_OCCURRENCE = "CASE WHEN payment_hash LIKE 'recurring:%' AND length(payment_hash) = 57 THEN substr(payment_hash, 48) END";

export function listForUser(db: Db, userId: string): Promise<RecurringRow[]> {
  return all<RecurringRow>(db, `SELECT ${COLUMNS} FROM recurring_items WHERE user_id = ? AND archived_at IS NULL ORDER BY kind, next_due_date, name COLLATE NOCASE`, [userId]);
}

export function fetchForUser(db: Db, userId: string, id: string): Promise<RecurringRow | null> {
  return first<RecurringRow>(db, `SELECT ${COLUMNS} FROM recurring_items WHERE user_id = ? AND id = ? AND archived_at IS NULL`, [userId, id]);
}

export async function countForUser(db: Db, userId: string): Promise<number> {
  const row = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recurring_items WHERE user_id = ? AND archived_at IS NULL', [userId]);
  return row?.n ?? 0;
}

export type NewRecurring = Omit<RecurringRow, 'id' | 'created_at' | 'updated_at'>;

export async function insert(db: Db, row: NewRecurring): Promise<RecurringRow> {
  const now = nowIso();
  const stored = await first<RecurringRow>(
    db,
    `INSERT INTO recurring_items
       (id, user_id, kind, name, amount, category_id, cadence, day_of_month, month_of_year, timezone, next_due_date, starts_on, active, note, remind_lead_days, next_remind_at, counts_toward_budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    [newId(), row.user_id, row.kind, row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.starts_on, row.active, row.note, row.remind_lead_days, row.next_remind_at, row.counts_toward_budget, now, now],
  );
  if (!stored) throw new Error('recurring insert returned no row');
  return stored;
}

/** Overwrite the editable columns of the user's item (the service merges the patch first). Null = not found. */
export function update(db: Db, userId: string, row: RecurringRow): Promise<RecurringRow | null> {
  return first<RecurringRow>(
    db,
    `UPDATE recurring_items SET name = ?, amount = ?, category_id = ?, cadence = ?, day_of_month = ?, month_of_year = ?,
       timezone = ?, next_due_date = ?, starts_on = ?, active = ?, note = ?, remind_lead_days = ?, next_remind_at = ?, counts_toward_budget = ?, updated_at = ?
     WHERE user_id = ? AND id = ? AND archived_at IS NULL RETURNING ${COLUMNS}`,
    [row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.starts_on, row.active, row.note, row.remind_lead_days, row.next_remind_at, row.counts_toward_budget, nowIso(), userId, row.id],
  );
}

/** Hard-deletes an item (only for undoing a create that failed half way; the user's delete is {@link archive}). */
export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  return (await run(db, 'DELETE FROM recurring_items WHERE user_id = ? AND id = ?', [userId, id])) > 0;
}

/**
 * The user's delete: archives the item (hidden everywhere, never posted or reminded again) and keeps it, so the transactions it
 * posted keep their `recurring_item_id` and the app can still show their history. False when there is no such live item.
 */
export async function archive(db: Db, userId: string, id: string): Promise<boolean> {
  const now = nowIso();
  return (
    (await run(db, 'UPDATE recurring_items SET archived_at = ?, active = 0, next_remind_at = NULL, updated_at = ? WHERE user_id = ? AND id = ? AND archived_at IS NULL', [now, now, userId, id])) > 0
  );
}

/**
 * The occurrences (`YYYY-MM-DD`) an item already has a fact for: its live postings (a row from before occurrences were recorded
 * is placed by its local day) and its skips (what the user deleted). An item posts once a period, so this stays small.
 */
export async function listOccurrences(db: Db, userId: string, itemId: string): Promise<string[]> {
  const rows = await all<{ occurrence: string }>(
    db,
    `SELECT COALESCE(recurring_occurrence, ${LEGACY_OCCURRENCE}, local_date, substr(transaction_at, 1, 10)) AS occurrence FROM transactions
       WHERE user_id = ? AND recurring_item_id = ? AND deleted_at IS NULL
     UNION
     SELECT occurrence FROM recurring_skips WHERE user_id = ? AND item_id = ?`,
    [userId, itemId, userId, itemId],
  );
  return rows.map((r) => r.occurrence);
}

/** Remember that the user deleted this occurrence's posting: the poster never posts it again (the deleted row is purged later). */
export async function addSkip(db: Db, userId: string, itemId: string, occurrence: string): Promise<void> {
  await run(db, 'INSERT OR IGNORE INTO recurring_skips (item_id, user_id, occurrence) VALUES (?, ?, ?)', [itemId, userId, occurrence]);
}

/** Forget a skip (the deleted posting came back). */
export async function removeSkip(db: Db, userId: string, itemId: string, occurrence: string): Promise<void> {
  await run(db, 'DELETE FROM recurring_skips WHERE user_id = ? AND item_id = ? AND occurrence = ?', [userId, itemId, occurrence]);
}

/** The skipped occurrences of the user's items between two dates (inclusive), as `item id:occurrence` keys. */
export async function listSkipKeys(db: Db, userId: string, from: string, to: string): Promise<Set<string>> {
  const rows = await all<{ item_id: string; occurrence: string }>(
    db,
    'SELECT item_id, occurrence FROM recurring_skips WHERE user_id = ? AND occurrence >= ? AND occurrence <= ?',
    [userId, from, to],
  );
  return new Set(rows.map((r) => `${r.item_id}:${r.occurrence}`));
}

export interface PostedRow {
  id: string;
  recurring_item_id: string;
  /** The period's due date the row stands for (`YYYY-MM-DD`); null for a row from before occurrences were recorded. */
  recurring_occurrence: string | null;
  amount: number;
  transaction_at: string;
  deleted_at: string | null;
}

/** Every transaction a recurring item posted in `[from, to)`, deleted ones included (a deleted one marks a skipped occurrence). */
export function listPostedIn(db: Db, userId: string, range: { from: string; to: string }): Promise<PostedRow[]> {
  return all<PostedRow>(
    db,
    `SELECT id, recurring_item_id, recurring_occurrence, amount, transaction_at, deleted_at FROM transactions
     WHERE user_id = ? AND recurring_item_id IS NOT NULL AND transaction_at >= ? AND transaction_at < ?`,
    [userId, range.from, range.to],
  );
}

/** The months (`YYYY-MM`) that hold live transactions of the item (at most 36, newest first): where its budget status matters. */
export async function postedMonths(db: Db, userId: string, itemId: string): Promise<string[]> {
  const rows = await all<{ month_key: string | null; transaction_at: string }>(
    db,
    `SELECT DISTINCT month_key, CASE WHEN month_key IS NULL THEN transaction_at END AS transaction_at FROM transactions
     WHERE user_id = ? AND recurring_item_id = ? AND deleted_at IS NULL ORDER BY month_key DESC LIMIT 36`,
    [userId, itemId],
  );
  return rows.map((r) => r.month_key ?? r.transaction_at.slice(0, 7));
}

/** Active items whose local due date is on or before `maxDate` (a UTC-date upper bound), oldest first. */
export function listDue(db: Db, maxDate: string, limit: number): Promise<RecurringRow[]> {
  return all<RecurringRow>(
    db,
    `SELECT ${COLUMNS} FROM recurring_items WHERE active = 1 AND archived_at IS NULL AND next_due_date <= ? ORDER BY next_due_date, id LIMIT ?`,
    [maxDate, limit],
  );
}

/**
 * Store the cache the poster recomputed from the facts (`next_due_date`, and the lead-day reminder instant of that occurrence), only
 * if the item is still as the caller read it (`expectedUpdatedAt`: an edit made meanwhile re-plans on its own and wins). This is not
 * a user edit, so `updated_at` stays.
 */
export async function setNextDue(db: Db, id: string, expectedUpdatedAt: string, nextDueDate: string, nextRemindAt: string | null): Promise<boolean> {
  return (
    (await run(db, 'UPDATE recurring_items SET next_due_date = ?, next_remind_at = ? WHERE id = ? AND updated_at = ?', [nextDueDate, nextRemindAt, id, expectedUpdatedAt])) > 0
  );
}

/** Active items with lead-day reminders whose next reminder instant has arrived, oldest first (all users: the reminders cron). */
export function listRemindDue(db: Db, nowIsoText: string, limit: number): Promise<RecurringRow[]> {
  return all<RecurringRow>(
    db,
    `SELECT ${COLUMNS} FROM recurring_items WHERE active = 1 AND archived_at IS NULL AND next_remind_at IS NOT NULL AND next_remind_at <= ? ORDER BY next_remind_at, id LIMIT ?`,
    [nowIsoText, limit],
  );
}

/** The reminders cron's next instant for an item, only if it is still on the one it picked (an edit or the poster wins). */
export async function setNextRemind(db: Db, id: string, expected: string, next: string | null): Promise<boolean> {
  return (await run(db, 'UPDATE recurring_items SET next_remind_at = ? WHERE id = ? AND next_remind_at = ?', [next, id, expected])) > 0;
}

/** The user's active items with lead-day reminders on, for re-planning after a reminder-settings change. */
export function listRemindableForUser(db: Db, userId: string): Promise<RecurringRow[]> {
  return all<RecurringRow>(db, `SELECT ${COLUMNS} FROM recurring_items WHERE user_id = ? AND active = 1 AND archived_at IS NULL AND remind_lead_days IS NOT NULL`, [userId]);
}

/** A statement for `db.batch` that re-plans one item's next reminder instant. */
export function setNextRemindStatement(db: Db, userId: string, id: string, next: string | null): D1PreparedStatement {
  return stmt(db, 'UPDATE recurring_items SET next_remind_at = ? WHERE user_id = ? AND id = ?', [next, userId, id]);
}

/** How many items are due a reminder (the cron logs what its per-tick cap left for the next run). */
export async function countRemindDue(db: Db, nowIsoText: string): Promise<number> {
  const row = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM recurring_items WHERE active = 1 AND archived_at IS NULL AND next_remind_at IS NOT NULL AND next_remind_at <= ?', [nowIsoText]);
  return row?.n ?? 0;
}
