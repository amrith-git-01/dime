import { all, first, newId, nowIso, run } from '../../core/db';
import type { Db } from '../../core/db';

/** A token belongs to one user: re-registering it on another account moves it (conflict on the token). */
export async function upsert(db: Db, userId: string, token: string, platform: string): Promise<string> {
  const now = nowIso();
  const row = await first<{ expo_push_token: string }>(
    db,
    `INSERT INTO user_push_tokens (id, user_id, expo_push_token, platform, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (expo_push_token) DO UPDATE SET
       user_id = excluded.user_id, platform = excluded.platform, updated_at = excluded.updated_at
     RETURNING expo_push_token`,
    [newId(), userId, token, platform, now, now],
  );
  return row?.expo_push_token || token;
}

export async function listTokens(db: Db, userId: string): Promise<string[]> {
  const data = await all<{ expo_push_token: string | null }>(
    db,
    'SELECT expo_push_token FROM user_push_tokens WHERE user_id = ?',
    [userId],
  );
  return data.map((r) => r.expo_push_token).filter((t): t is string => typeof t === 'string' && t !== '');
}

export async function deleteToken(db: Db, userId: string, token: string): Promise<void> {
  await run(db, 'DELETE FROM user_push_tokens WHERE user_id = ? AND expo_push_token = ?', [userId, token]);
}

export async function deleteAllForUser(db: Db, userId: string): Promise<void> {
  await run(db, 'DELETE FROM user_push_tokens WHERE user_id = ?', [userId]);
}

/** Prune a token Expo reported as unregistered (any owner). */
export async function deleteByToken(db: Db, token: string): Promise<void> {
  await run(db, 'DELETE FROM user_push_tokens WHERE expo_push_token = ?', [token]);
}
