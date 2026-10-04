import { isUniqueViolation } from '../../core/db-errors';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';
import type { DigestKind } from './tokens';

export type EmailKind = 'welcome' | DigestKind;

/** A `pending` claim older than this belongs to a worker that died between claim and send. */
export const PENDING_RECLAIM_AFTER_MS = 30 * 60 * 1000;

export interface SendKey {
  userId: string;
  kind: EmailKind;
  periodKey: string;
}

/**
 * Claim the send of one email: `email_sends` has a unique `(user_id, kind, period_key)`.
 *
 * Returns false only when another worker already holds or finished it. Only a unique violation
 * (Postgres 23505 / PostgREST 409) means "already claimed"; any other error, including a network
 * failure, propagates so the caller can retry instead of silently skipping. A `pending` row older
 * than `PENDING_RECLAIM_AFTER_MS` is re-claimed (conditional update: exactly one worker wins).
 */
export async function tryBegin(db: DimeSupabaseClient, key: SendKey, nowMs: number = Date.now()): Promise<boolean> {
  const nowIso = new Date(nowMs).toISOString();
  try {
    await db
      .from('email_sends')
      .insert({ user_id: key.userId, kind: key.kind, period_key: key.periodKey, status: 'pending', claimed_at: nowIso })
      .throwOnError();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return reclaimStalePending(db, key, nowMs);
  }
  return true;
}

async function reclaimStalePending(db: DimeSupabaseClient, key: SendKey, nowMs: number): Promise<boolean> {
  const { data } = await db
    .from('email_sends')
    .update({ claimed_at: new Date(nowMs).toISOString() })
    .eq('user_id', key.userId)
    .eq('kind', key.kind)
    .eq('period_key', key.periodKey)
    .eq('status', 'pending')
    .lt('claimed_at', new Date(nowMs - PENDING_RECLAIM_AFTER_MS).toISOString())
    .select('id')
    .throwOnError()
    .overrideTypes<{ id: string }[], { merge: false }>();
  const reclaimed = (data ?? []).length > 0;
  log.info('email_sends_begin', { result: reclaimed ? 'reclaimed_stale_pending' : 'skipped_already_claimed', kind: key.kind, period: key.periodKey });
  return reclaimed;
}

export async function markSent(db: DimeSupabaseClient, key: SendKey, messageId: string | null): Promise<void> {
  await db
    .from('email_sends')
    .update({ status: 'sent', sent_at: new Date().toISOString(), brevo_message_id: messageId })
    .eq('user_id', key.userId)
    .eq('kind', key.kind)
    .eq('period_key', key.periodKey)
    .throwOnError();
}

/** Release a claim after a failed send so a later run (or a retry) can claim it again. */
export async function deletePending(db: DimeSupabaseClient, key: SendKey): Promise<void> {
  await db
    .from('email_sends')
    .delete()
    .eq('user_id', key.userId)
    .eq('kind', key.kind)
    .eq('period_key', key.periodKey)
    .eq('status', 'pending')
    .throwOnError();
}

const PAGE_SIZE = 1000;

/** Ids of the users who have this digest switched on, in stable order, one page at a time. */
export async function* listDigestUserPages(db: DimeSupabaseClient, kind: DigestKind): AsyncGenerator<string[]> {
  const column = kind === 'weekly' ? 'weekly_email_enabled' : 'monthly_email_enabled';
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await db
      .from('user_settings')
      .select('user_id')
      .eq(column, true)
      .order('user_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .throwOnError()
      .overrideTypes<{ user_id: string }[], { merge: false }>();
    const ids = data.map((r) => r.user_id).filter((id) => typeof id === 'string' && id !== '');
    if (ids.length > 0) yield ids;
    if (data.length < PAGE_SIZE) return;
  }
}

export interface UserEmail {
  email: string | null;
  username: string | null;
}

export async function fetchUserEmail(db: DimeSupabaseClient, userId: string): Promise<UserEmail> {
  const { data } = await db
    .from('users')
    .select('email,username')
    .eq('id', userId)
    .maybeSingle()
    .throwOnError()
    .overrideTypes<{ email: string | null; username: string | null }, { merge: false }>();
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return { email: clean(data?.email), username: clean(data?.username) };
}
