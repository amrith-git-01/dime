import type { Db } from '../../core/db';
import * as repo from './repository';
import type { SettingsPatch } from './schemas';
import { settingsFromRow } from './snapshot';
import type { UserSettings } from './snapshot';

export async function getOrCreate(db: Db, userId: string): Promise<UserSettings> {
  let row = await repo.fetchByUserId(db, userId);
  if (!row) row = (await repo.insertDefaults(db, userId)) ?? (await repo.fetchByUserId(db, userId));
  return settingsFromRow(row);
}

/** Keys accepted for old app builds but no longer stored (the daily budget was removed). */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['budget_daily_alerts_enabled', 'budget_daily_warn_pct']);

/** Fields present and non-null in the patch (null = unchanged, as in Python). */
function patchFields(body: SettingsPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined && !IGNORED_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** Common case is one round trip: update-with-return. A missing row is created with the patch applied. */
export async function patch(db: Db, userId: string, body: SettingsPatch): Promise<UserSettings> {
  const fields = patchFields(body);
  if (Object.keys(fields).length === 0) return getOrCreate(db, userId);

  let row = await repo.update(db, userId, fields);
  if (!row) {
    row = await repo.insertDefaults(db, userId, fields);
    // Lost a creation race: the row exists now, so apply the patch to it.
    row ??= await repo.update(db, userId, fields);
  }
  return settingsFromRow(row);
}
