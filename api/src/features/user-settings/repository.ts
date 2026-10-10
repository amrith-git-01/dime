import { first, fromFlag, nowIso, toFlag } from '../../core/db';
import type { Db, SqlParam } from '../../core/db';
import { DEFAULT_SETTINGS, SETTINGS_COLUMNS } from './snapshot';

export type SettingsRow = Record<string, unknown>;

/** Booleans are stored as 0/1; hand services real booleans. */
function toSettingsRow(row: SettingsRow): SettingsRow {
  const out: SettingsRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] === 'boolean' ? fromFlag(value) : value;
  }
  return out;
}

const param = (value: unknown): SqlParam => (typeof value === 'boolean' ? toFlag(value) : (value as SqlParam));

export async function fetchByUserId(db: Db, userId: string): Promise<SettingsRow | null> {
  const row = await first<SettingsRow>(db, `SELECT ${SETTINGS_COLUMNS} FROM user_settings WHERE user_id = ?`, [userId]);
  return row ? toSettingsRow(row) : null;
}

/** Insert a row (defaults + overrides). Race-safe: returns null if another request created it first. */
export async function insertDefaults(
  db: Db,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<SettingsRow | null> {
  const values: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...overrides };
  const columns = Object.keys(values);
  const now = nowIso();
  const row = await first<SettingsRow>(
    db,
    `INSERT INTO user_settings (user_id, ${columns.join(', ')}, created_at, updated_at)
     VALUES (?, ${columns.map(() => '?').join(', ')}, ?, ?)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING ${SETTINGS_COLUMNS}`,
    [userId, ...columns.map((c) => param(values[c])), now, now],
  );
  return row ? toSettingsRow(row) : null;
}

/** Update and return the row in one call; null when the user has no settings row yet. */
export async function update(db: Db, userId: string, patch: Record<string, unknown>): Promise<SettingsRow | null> {
  const columns = Object.keys(patch);
  const row = await first<SettingsRow>(
    db,
    `UPDATE user_settings SET ${[...columns.map((c) => `${c} = ?`), 'updated_at = ?'].join(', ')}
     WHERE user_id = ? RETURNING ${SETTINGS_COLUMNS}`,
    [...columns.map((c) => param(patch[c])), nowIso(), userId],
  );
  return row ? toSettingsRow(row) : null;
}
