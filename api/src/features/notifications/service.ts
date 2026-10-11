import { NotFoundError } from '../../core/errors';
import type { Db } from '../../core/db';
import { isoUtc, isoUtcOrNull } from '../../core/timestamps';
import * as repo from './repository';
import type { ListQuery, NotificationListResponse, NotificationResponse, NotificationRow } from './schemas';

function rowToResponse(row: NotificationRow): NotificationResponse {
  return {
    id: String(row.id).toLowerCase(),
    kind: row.kind,
    title: String(row.title),
    body: String(row.body),
    created_at: isoUtc(row.created_at),
    read_at: isoUtcOrNull(row.read_at),
    action: {
      type: row.action_type ?? 'none',
      transaction_id: row.action_transaction_id == null ? null : String(row.action_transaction_id).toLowerCase(),
    },
  };
}

export async function listInbox(db: Db, userId: string, q: ListQuery): Promise<NotificationListResponse> {
  const rows = await repo.listForUser(db, userId, { filter: q.filter, limit: q.limit + 1, before: q.before });
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(rowToResponse),
    next_cursor: hasMore && last ? `${isoUtc(last.created_at)}|${String(last.id).toLowerCase()}` : null,
  };
}

export async function unreadCount(db: Db, userId: string): Promise<{ count: number }> {
  return { count: await repo.countUnread(db, userId) };
}

export async function markRead(db: Db, userId: string, id: string): Promise<NotificationResponse> {
  const row = await repo.markRead(db, userId, id);
  if (!row) throw new NotFoundError('Notification not found.');
  return rowToResponse(row);
}

export async function remove(db: Db, userId: string, id: string): Promise<void> {
  if (!(await repo.softDelete(db, userId, id))) throw new NotFoundError('Notification not found.');
}
