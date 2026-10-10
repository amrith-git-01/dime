import { all, first, newId, run } from '../../core/db';
import type { Db } from '../../core/db';
import { isUniqueViolation } from '../../core/db-errors';
import { log } from '../../core/logging';
import type { DigestKind } from './tokens';

type EmailKind = 'welcome' | DigestKind;

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
 * (SQLite UNIQUE constraint) means "already claimed"; any other error, including a network
 * failure, propagates so the caller can retry instead of silently skipping. A `pending` row older
 * than `PENDING_RECLAIM_AFTER_MS` is re-claimed (conditional update: exactly one worker wins).
 */
export async function tryBegin(db: Db, key: SendKey, nowMs: number = Date.now()): Promise<boolean> {
  const nowIso = new Date(nowMs).toISOString();
  try {
    await run(
      db,
      `INSERT INTO email_sends (id, user_id, kind, period_key, status, claimed_at, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [newId(), key.userId, key.kind, key.periodKey, nowIso, nowIso],
    );
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return reclaimStalePending(db, key, nowMs);
  }
  return true;
}

async function reclaimStalePending(db: Db, key: SendKey, nowMs: number): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    `UPDATE email_sends SET claimed_at = ?
     WHERE user_id = ? AND kind = ? AND period_key = ? AND status = 'pending' AND claimed_at < ? RETURNING id`,
    [new Date(nowMs).toISOString(), key.userId, key.kind, key.periodKey, new Date(nowMs - PENDING_RECLAIM_AFTER_MS).toISOString()],
  );
  const reclaimed = row !== null;
  log.info('email_sends_begin', { result: reclaimed ? 'reclaimed_stale_pending' : 'skipped_already_claimed', kind: key.kind, period: key.periodKey });
  return reclaimed;
}

export async function markSent(db: Db, key: SendKey, messageId: string | null): Promise<void> {
  await run(
    db,
    "UPDATE email_sends SET status = 'sent', sent_at = ?, brevo_message_id = ? WHERE user_id = ? AND kind = ? AND period_key = ?",
    [new Date().toISOString(), messageId, key.userId, key.kind, key.periodKey],
  );
}

/** Release a claim after a failed send so a later run (or a retry) can claim it again. */
export async function deletePending(db: Db, key: SendKey): Promise<void> {
  await run(db, "DELETE FROM email_sends WHERE user_id = ? AND kind = ? AND period_key = ? AND status = 'pending'", [
    key.userId,
    key.kind,
    key.periodKey,
  ]);
}

const PAGE_SIZE = 1000;

/** Ids of the users who have this digest switched on, in stable order, one page at a time. */
export async function* listDigestUserPages(db: Db, kind: DigestKind): AsyncGenerator<string[]> {
  const column = kind === 'weekly' ? 'weekly_email_enabled' : 'monthly_email_enabled';
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const data = await all<{ user_id: string }>(
      db,
      `SELECT user_id FROM user_settings WHERE ${column} = 1 ORDER BY user_id ASC LIMIT ? OFFSET ?`,
      [PAGE_SIZE, offset],
    );
    const ids = data.map((r) => r.user_id).filter((id) => typeof id === 'string' && id !== '');
    if (ids.length > 0) yield ids;
    if (data.length < PAGE_SIZE) return;
  }
}

export interface UserEmail {
  email: string | null;
  username: string | null;
}

export async function fetchUserEmail(db: Db, userId: string): Promise<UserEmail> {
  const data = await first<{ email: string | null; username: string | null }>(
    db,
    'SELECT email, username FROM users WHERE id = ?',
    [userId],
  );
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  return { email: clean(data?.email), username: clean(data?.username) };
}
