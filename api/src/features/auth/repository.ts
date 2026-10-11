import { batch, first, nowIso, run, stmt } from '../../core/db';
import type { Db } from '../../core/db';
import type { SessionRow } from './schemas';

export interface NewSession {
  id: string;
  userId: string;
  refreshHash: string;
  familyId: string;
  expiresAt: string;
}

export async function findIdentityUser(db: Db, provider: string, subject: string): Promise<string | null> {
  const row = await first<{ user_id: string }>(
    db,
    'SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?',
    [provider, subject],
  );
  return row?.user_id ?? null;
}

/** Oldest account with this email (case-insensitive): the one a first Google sign-in links to. */
export async function findUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const row = await first<{ id: string }>(
    db,
    'SELECT id FROM users WHERE lower(email) = lower(?) ORDER BY created_at LIMIT 1',
    [email],
  );
  return row?.id ?? null;
}

/** New account + identity in one transaction. A lost race on the identity rolls the user back too. */
export async function createUserWithIdentity(
  db: Db,
  input: { userId: string; provider: string; subject: string; email: string },
): Promise<void> {
  const now = nowIso();
  await batch(db, [
    stmt(db, 'INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)', [input.userId, input.email, now, now]),
    stmt(db, 'INSERT INTO auth_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)', [
      input.provider,
      input.subject,
      input.userId,
      input.email,
      now,
    ]),
  ]);
}

export async function linkIdentity(
  db: Db,
  input: { userId: string; provider: string; subject: string; email: string },
): Promise<void> {
  await run(
    db,
    `INSERT INTO auth_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (provider, subject) DO NOTHING`,
    [input.provider, input.subject, input.userId, input.email, nowIso()],
  );
}

export async function userEmail(db: Db, userId: string): Promise<string | null> {
  const row = await first<{ email: string | null }>(db, 'SELECT email FROM users WHERE id = ?', [userId]);
  return row?.email ?? null;
}

export async function insertSession(db: Db, s: NewSession): Promise<void> {
  await run(
    db,
    'INSERT INTO auth_sessions (id, user_id, refresh_hash, family_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    [s.id, s.userId, s.refreshHash, s.familyId, nowIso(), s.expiresAt],
  );
}

export async function findByRefreshHash(db: Db, hash: string): Promise<SessionRow | null> {
  return first<SessionRow>(
    db,
    'SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by FROM auth_sessions WHERE refresh_hash = ?',
    [hash],
  );
}

/**
 * Rotate in one transaction. The UPDATE is the compare-and-set (only a still-live session is revoked);
 * the INSERT runs only if that update won (`replaced_by` is our new id), so two concurrent refreshes of
 * one token can never both mint a session. True = we won.
 */
export async function rotate(db: Db, oldId: string, next: NewSession): Promise<boolean> {
  const now = nowIso();
  const [won] = await batch<{ id: string }>(db, [
    stmt(db, 'UPDATE auth_sessions SET revoked_at = ?, replaced_by = ? WHERE id = ? AND revoked_at IS NULL RETURNING id', [
      now,
      next.id,
      oldId,
    ]),
    stmt(
      db,
      `INSERT INTO auth_sessions (id, user_id, refresh_hash, family_id, created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM auth_sessions WHERE id = ? AND replaced_by = ?)`,
      [next.id, next.userId, next.refreshHash, next.familyId, now, next.expiresAt, oldId, next.id],
    ),
  ]);
  return (won?.length ?? 0) > 0;
}

/** Extra session for a grace replay of a just-rotated token; only inserted while the family still has a live session. True = inserted. */
export async function insertGraceChild(db: Db, s: NewSession): Promise<boolean> {
  const row = await first<{ id: string }>(
    db,
    `INSERT INTO auth_sessions (id, user_id, refresh_hash, family_id, created_at, expires_at)
     SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM auth_sessions WHERE family_id = ? AND revoked_at IS NULL)
     RETURNING id`,
    [s.id, s.userId, s.refreshHash, s.familyId, nowIso(), s.expiresAt, s.familyId],
  );
  return row !== null;
}

export async function revokeFamily(db: Db, familyId: string): Promise<void> {
  await run(db, 'UPDATE auth_sessions SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL', [nowIso(), familyId]);
}

/** Revoke one session of this user, by id or by refresh-token hash. */
export async function revokeSession(db: Db, userId: string, by: { id: string } | { refreshHash: string }): Promise<void> {
  const [col, value] = 'id' in by ? (['id', by.id] as const) : (['refresh_hash', by.refreshHash] as const);
  await run(db, `UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND ${col} = ? AND revoked_at IS NULL`, [
    nowIso(),
    userId,
    value,
  ]);
}

export async function revokeAllForUser(db: Db, userId: string): Promise<void> {
  await run(db, 'UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), userId]);
}
