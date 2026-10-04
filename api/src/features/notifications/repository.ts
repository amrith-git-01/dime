import type { DimeSupabaseClient } from '../../core/supabase';
import { NOTIFICATION_COLUMNS } from './schemas';
import type { NewNotification, NotificationFilter, NotificationRow } from './schemas';

/** Newest first. Callers pass `limit + 1` to learn whether another page exists. */
export async function listForUser(
  db: DimeSupabaseClient,
  userId: string,
  opts: { filter: NotificationFilter; limit: number; before?: string },
): Promise<NotificationRow[]> {
  let q = db.from('notifications').select(NOTIFICATION_COLUMNS).eq('user_id', userId).is('deleted_at', null);
  if (opts.filter === 'unread') q = q.is('read_at', null);
  else if (opts.filter === 'read') q = q.not('read_at', 'is', null);
  if (opts.before) q = q.lt('created_at', opts.before);
  const { data } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(opts.limit)
    .throwOnError()
    .overrideTypes<NotificationRow[], { merge: false }>();
  return data;
}

/**
 * Race-free dedupe (unique `(user_id, dedupe_key)`): a conflict inserts nothing and returns null,
 * so callers must not push. A soft-deleted notification still occupies its key.
 */
export async function insertDeduped(db: DimeSupabaseClient, row: NewNotification): Promise<NotificationRow | null> {
  if (!row.user_id || !row.dedupe_key) throw new Error('insertDeduped requires user_id and dedupe_key');
  const { data } = await db
    .from('notifications')
    .upsert(row, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
    .select(NOTIFICATION_COLUMNS)
    .throwOnError()
    .overrideTypes<NotificationRow[], { merge: false }>();
  return data[0] ?? null;
}

export async function markRead(db: DimeSupabaseClient, userId: string, id: string): Promise<NotificationRow | null> {
  const { data } = await db
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id)
    .is('deleted_at', null)
    .select(NOTIFICATION_COLUMNS)
    .throwOnError()
    .overrideTypes<NotificationRow[], { merge: false }>();
  return data[0] ?? null;
}

export async function softDelete(db: DimeSupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data } = await db
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id')
    .throwOnError()
    .overrideTypes<{ id: string }[], { merge: false }>();
  return data.length > 0;
}

export async function countUnread(db: DimeSupabaseClient, userId: string): Promise<number> {
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
    .is('deleted_at', null)
    .throwOnError();
  return count ?? 0;
}
