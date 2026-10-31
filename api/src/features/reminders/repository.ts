import { all, chunks, first, newId, nowIso, run, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import type { ReminderRow } from './schemas';

/** Every query is scoped by `user_id`, except the cron's `listDue` (it serves all users, then acts per reminder owner). */
const COLUMNS =
  'id,user_id,direction,title,amount,counterparty_name,payee_key,upi_id,due_date,cadence,anchor_day,lead_days,remind_time,timezone,status,completed_at,completed_txn_id,used_txn_ids,fired_through,next_fire_at,created_at,updated_at';

export const MAX_REMINDERS_PER_USER = 500;

export type ListStatus = 'open' | 'done' | 'all';

/** Open ones first by due date; finished ones newest first. */
export function listForUser(db: Db, userId: string, status: ListStatus, limit: number): Promise<ReminderRow[]> {
  const where = status === 'open' ? "AND status = 'open'" : status === 'done' ? "AND status != 'open'" : '';
  return all<ReminderRow>(
    db,
    `SELECT ${COLUMNS} FROM reminders WHERE user_id = ? ${where}
     ORDER BY status != 'open', CASE WHEN status = 'open' THEN due_date END, COALESCE(completed_at, updated_at) DESC, id LIMIT ?`,
    [userId, limit],
  );
}

export function fetchForUser(db: Db, userId: string, id: string): Promise<ReminderRow | null> {
  return first<ReminderRow>(db, `SELECT ${COLUMNS} FROM reminders WHERE user_id = ? AND id = ?`, [userId, id]);
}

export async function countForUser(db: Db, userId: string): Promise<number> {
  const row = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?', [userId]);
  return row?.n ?? 0;
}

export type NewReminder = Omit<ReminderRow, 'id' | 'created_at' | 'updated_at'>;

export async function insert(db: Db, row: NewReminder): Promise<ReminderRow> {
  const now = nowIso();
  const stored = await first<ReminderRow>(
    db,
    `INSERT INTO reminders
       (id, user_id, direction, title, amount, counterparty_name, payee_key, upi_id, due_date, cadence, anchor_day, lead_days, remind_time,
        timezone, status, completed_at, completed_txn_id, used_txn_ids, fired_through, next_fire_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    [
      newId(), row.user_id, row.direction, row.title, row.amount, row.counterparty_name, row.payee_key, row.upi_id, row.due_date, row.cadence,
      row.anchor_day, row.lead_days, row.remind_time, row.timezone, row.status, row.completed_at, row.completed_txn_id, row.used_txn_ids,
      row.fired_through, row.next_fire_at, now, now,
    ],
  );
  if (!stored) throw new Error('reminder insert returned no row');
  return stored;
}

/** Overwrite every editable and state column of the user's reminder (the service merges the patch first). Null = not found. */
export function update(db: Db, userId: string, row: ReminderRow): Promise<ReminderRow | null> {
  return first<ReminderRow>(
    db,
    `UPDATE reminders SET direction = ?, title = ?, amount = ?, counterparty_name = ?, payee_key = ?, upi_id = ?, due_date = ?, cadence = ?,
       anchor_day = ?, lead_days = ?, remind_time = ?, timezone = ?, status = ?, completed_at = ?, completed_txn_id = ?, used_txn_ids = ?,
       fired_through = ?, next_fire_at = ?, updated_at = ?
     WHERE user_id = ? AND id = ? RETURNING ${COLUMNS}`,
    [
      row.direction, row.title, row.amount, row.counterparty_name, row.payee_key, row.upi_id, row.due_date, row.cadence, row.anchor_day,
      row.lead_days, row.remind_time, row.timezone, row.status, row.completed_at, row.completed_txn_id, row.used_txn_ids, row.fired_through,
      row.next_fire_at, nowIso(), userId, row.id,
    ],
  );
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  return (await run(db, 'DELETE FROM reminders WHERE user_id = ? AND id = ?', [userId, id])) > 0;
}

/** Open reminders whose next instant has arrived, oldest first. */
export function listDue(db: Db, nowIsoText: string, limit: number): Promise<ReminderRow[]> {
  return all<ReminderRow>(
    db,
    `SELECT ${COLUMNS} FROM reminders WHERE status = 'open' AND next_fire_at IS NOT NULL AND next_fire_at <= ? ORDER BY next_fire_at, id LIMIT ?`,
    [nowIsoText, limit],
  );
}

/** Every open reminder of the user (at most `MAX_REMINDERS_PER_USER`), for re-planning after a settings change. */
export function listOpenForUser(db: Db, userId: string): Promise<ReminderRow[]> {
  return all<ReminderRow>(db, `SELECT ${COLUMNS} FROM reminders WHERE user_id = ? AND status = 'open'`, [userId]);
}

/** A statement for `db.batch` that re-plans one open reminder's next instant. */
export function setNextFireStatement(db: Db, userId: string, id: string, nextFireAt: string | null): D1PreparedStatement {
  return stmt(db, "UPDATE reminders SET next_fire_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND status = 'open'", [nextFireAt, nowIso(), userId, id]);
}

/** How many open reminders are due (the cron logs what its per-tick cap left for the next run). */
export async function countDue(db: Db, nowIsoText: string): Promise<number> {
  const row = await first<{ n: number }>(db, "SELECT COUNT(*) AS n FROM reminders WHERE status = 'open' AND next_fire_at IS NOT NULL AND next_fire_at <= ?", [nowIsoText]);
  return row?.n ?? 0;
}

export interface FireState {
  due_date: string;
  fired_through: string | null;
  next_fire_at: string | null;
}

/** Record what the cron just did, only if the reminder is still open and on the instant it picked (an edit or another run wins). */
export async function advance(db: Db, id: string, expected: { due_date: string; next_fire_at: string }, next: FireState): Promise<boolean> {
  return (
    (await run(
      db,
      `UPDATE reminders SET due_date = ?, fired_through = ?, next_fire_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open' AND due_date = ? AND next_fire_at = ?`,
      [next.due_date, next.fired_through, next.next_fire_at, nowIso(), id, expected.due_date, expected.next_fire_at],
    )) > 0
  );
}

/** One reminder's search for a payment: its type, local-day window and the payee / amount it must equal (null = any). */
export interface MatchWindow {
  id: string;
  type: 'debit' | 'credit';
  from: string;
  to: string;
  /** The due day's start (ISO): the closest transaction to it wins. */
  at: string;
  key: string | null;
  amount: number | null;
}

export interface Match {
  rid: string;
  id: string;
  amount: number;
  counterparty_name: string | null;
  transaction_at: string;
}

/** Reminders per statement: each window is about 250 bytes of JSON, so a statement stays far below D1's limits. */
const MATCH_CHUNK = 100;

/**
 * The "looks paid" suggestions of a list: for EACH window, the one live transaction of its type inside its own window whose
 * payee and amount equal the reminder's, closest to the due day (excluding transactions already used to complete a reminder).
 * The windows travel as one JSON parameter and join `transactions` through its (user, time) index, and a window function keeps
 * one row per reminder, so nothing can be cut off by a row limit, whatever the amounts and windows look like. Chunked by 100.
 */
export async function listMatches(db: Db, userId: string, windows: readonly MatchWindow[]): Promise<Match[]> {
  const results = await Promise.all(
    chunks(windows, MATCH_CHUNK).map((chunk) =>
      all<Match>(
        db,
        `WITH w AS (
           SELECT json_extract(value, '$.id') AS rid, json_extract(value, '$.type') AS type, json_extract(value, '$.from') AS from_at,
                  json_extract(value, '$.to') AS to_at, json_extract(value, '$.at') AS at, json_extract(value, '$.key') AS key,
                  json_extract(value, '$.amount') AS amount
           FROM json_each(?)
         )
         SELECT rid, id, amount, counterparty_name, transaction_at FROM (
           SELECT w.rid AS rid, t.id AS id, t.amount AS amount, t.counterparty_name AS counterparty_name, t.transaction_at AS transaction_at,
                  ROW_NUMBER() OVER (PARTITION BY w.rid ORDER BY ABS(julianday(t.transaction_at) - julianday(w.at)), t.transaction_at DESC) AS rn
           FROM w JOIN transactions t
             ON t.user_id = ? AND t.deleted_at IS NULL AND t.type = w.type AND t.transaction_at >= w.from_at AND t.transaction_at < w.to_at
            AND (w.key IS NULL OR t.payee_key = w.key) AND (w.amount IS NULL OR t.amount = w.amount)
           WHERE t.id NOT IN (
             SELECT completed_txn_id FROM reminders WHERE user_id = ? AND completed_txn_id IS NOT NULL
             UNION SELECT j.value FROM reminders r, json_each(r.used_txn_ids) j WHERE r.user_id = ?
           )
         ) WHERE rn = 1`,
        [JSON.stringify(chunk), userId, userId, userId],
      ),
    ),
  );
  return results.flat();
}

/** The user's live transaction `id`, or null (to validate `complete`'s `transaction_id`). */
export async function transactionExists(db: Db, userId: string, id: string): Promise<boolean> {
  return (await first<{ x: number }>(db, 'SELECT 1 AS x FROM transactions WHERE user_id = ? AND id = ? AND deleted_at IS NULL', [userId, id])) !== null;
}
