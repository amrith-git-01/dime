import { all, first, newId, nowIso } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { NOTIFICATION_COLUMNS } from './schemas';
import type { NewNotification, NotificationFilter, NotificationRow } from './schemas';

/** Newest first. Callers pass `limit + 1` to learn whether another page exists. */
export async function listForUser(
  db: Db,
  userId: string,
  opts: { filter: NotificationFilter; limit: number; before?: string | undefined },
): Promise<NotificationRow[]> {
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params: SqlParam[] = [userId];
  if (opts.filter === 'unread') where.push('read_at IS NULL');
  else if (opts.filter === 'read') where.push('read_at IS NOT NULL');
  if (opts.before) {
    // Stored timestamps are canonical ISO text, so the cursor is canonicalized before comparing. The cursor is
    // `<created_at>|<id>`: ties on created_at are broken by id, matching the ORDER BY (a bare timestamp skips ties).
    const [time = '', id] = opts.before.split('|');
    const at = new Date(Date.parse(time)).toISOString();
    if (id) {
      where.push('(created_at < ? OR (created_at = ? AND id < ?))');
      params.push(at, at, id.toLowerCase());
    } else {
      where.push('created_at < ?');
      params.push(at);
    }
  }
  params.push(opts.limit);
  return all<NotificationRow>(
    db,
    `SELECT ${NOTIFICATION_COLUMNS} FROM notifications WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    params,
  );
}

/**
 * Race-free dedupe (unique `(user_id, dedupe_key)`): a conflict inserts nothing and returns null,
 * so callers must not push. A soft-deleted notification still occupies its key.
 */
export async function insertDeduped(db: Db, row: NewNotification): Promise<NotificationRow | null> {
  if (!row.user_id || !row.dedupe_key) throw new Error('insertDeduped requires user_id and dedupe_key');
  return first<NotificationRow>(
    db,
    `INSERT INTO notifications
       (id, user_id, kind, title, body, action_type, action_transaction_id, action_period_key, action_reminder_id, dedupe_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [newId(), row.user_id, row.kind, row.title, row.body, row.action_type, row.action_transaction_id, row.action_period_key ?? null, row.action_reminder_id ?? null, row.dedupe_key, nowIso()],
  );
}

export async function markRead(db: Db, userId: string, id: string): Promise<NotificationRow | null> {
  return first<NotificationRow>(
    db,
    `UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL
     RETURNING ${NOTIFICATION_COLUMNS}`,
    [nowIso(), userId, id.toLowerCase()],
  );
}

export async function softDelete(db: Db, userId: string, id: string): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    'UPDATE notifications SET deleted_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL RETURNING id',
    [nowIso(), userId, id.toLowerCase()],
  );
  return row !== null;
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const row = await first<{ n: number }>(
    db,
    'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL AND deleted_at IS NULL',
    [userId],
  );
  return row?.n ?? 0;
}
