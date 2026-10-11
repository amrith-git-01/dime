import { first, nowIso, run } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { USER_COLUMNS } from './schemas';
import type { UserRow } from './schemas';

/** `users` access. Always scoped by the JWT user id. */
export async function fetchById(db: Db, userId: string): Promise<UserRow | null> {
  return first<UserRow>(db, `SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [userId]);
}

/** Fetch only `username` (feedback reporter name). */
export async function fetchUsername(db: Db, userId: string): Promise<string | null> {
  const row = await first<{ username: string | null }>(db, 'SELECT username FROM users WHERE id = ?', [userId]);
  return row?.username ?? null;
}

/** Insert-or-update the profile and return the stored row in one statement. */
export async function upsertProfile(
  db: Db,
  input: { userId: string; username: string; currency: string; avatarUrl: string | null },
): Promise<UserRow> {
  const now = nowIso();
  const columns = ['id', 'username', 'currency', 'created_at', 'updated_at'];
  const params: SqlParam[] = [input.userId, input.username, input.currency, now, now];
  const updates = ['username = excluded.username', 'currency = excluded.currency', 'updated_at = excluded.updated_at'];
  // The avatar is only written when supplied: an absent value keeps the stored one.
  if (input.avatarUrl !== null) {
    columns.push('avatar_url');
    params.push(input.avatarUrl);
    updates.push('avatar_url = excluded.avatar_url');
  }
  const row = await first<UserRow>(
    db,
    `INSERT INTO users (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}
     RETURNING ${USER_COLUMNS}`,
    params,
  );
  if (!row) throw new Error('profile upsert returned no row');
  return row;
}

export async function updateEmailIfRowExists(db: Db, userId: string, email: string): Promise<void> {
  await run(db, 'UPDATE users SET email = ?, updated_at = ? WHERE id = ?', [email, nowIso(), userId]);
}
