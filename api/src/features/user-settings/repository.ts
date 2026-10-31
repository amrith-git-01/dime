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
  // `card_layouts` is stored as JSON text (NULL = nothing rearranged); a caller passes it as a ready string.
  // `reminder_default_lead_days` is JSON text too (a ready string from the service, else the default list).
  const values: Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...overrides,
    card_layouts: overrides['card_layouts'] ?? null,
    reminder_default_lead_days: overrides['reminder_default_lead_days'] ?? JSON.stringify(DEFAULT_SETTINGS.reminder_default_lead_days),
  };
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

/**
 * Merge a JSON patch (RFC 7396: arrays replace, `null` removes a key) into the stored card layouts. Done in SQL so two
 * devices arranging different screens at once cannot overwrite each other; corrupt stored JSON starts over from `{}`
 * and an empty result is stored as NULL.
 */
const MERGE_CARD_LAYOUTS = `card_layouts = NULLIF(json_patch(CASE WHEN json_valid(card_layouts) AND json_type(card_layouts) = 'object' THEN card_layouts ELSE '{}' END, ?), '{}')`;

/**
 * Update and return the row in one call; null when the user has no settings row yet.
 * `cardLayoutsPatch` is a JSON merge patch for the `card_layouts` column (see MERGE_CARD_LAYOUTS).
 */
export async function update(
  db: Db,
  userId: string,
  patch: Record<string, unknown>,
  cardLayoutsPatch?: string,
): Promise<SettingsRow | null> {
  const columns = Object.keys(patch);
  const sets = [...columns.map((c) => `${c} = ?`)];
  const params = columns.map((c) => param(patch[c]));
  if (cardLayoutsPatch !== undefined) {
    sets.push(MERGE_CARD_LAYOUTS);
    params.push(cardLayoutsPatch);
  }
  const row = await first<SettingsRow>(
    db,
    `UPDATE user_settings SET ${[...sets, 'updated_at = ?'].join(', ')}
     WHERE user_id = ? RETURNING ${SETTINGS_COLUMNS}`,
    [...params, nowIso(), userId],
  );
  return row ? toSettingsRow(row) : null;
}
