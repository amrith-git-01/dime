import type { DimeSupabaseClient } from '../../core/supabase';
import * as repo from './repository';
import type { SettingsPatch } from './schemas';
import { settingsFromRow } from './snapshot';
import type { UserSettings } from './snapshot';

export async function getOrCreate(db: DimeSupabaseClient, userId: string): Promise<UserSettings> {
  let row = await repo.fetchByUserId(db, userId);
  if (!row) row = (await repo.insertDefaults(db, userId)) ?? (await repo.fetchByUserId(db, userId));
  return settingsFromRow(row);
}

/** Fields present and non-null in the patch (null = unchanged, as in Python). */
function patchFields(body: SettingsPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/** Common case is one round trip: update-with-return. A missing row is created with the patch applied. */
export async function patch(db: DimeSupabaseClient, userId: string, body: SettingsPatch): Promise<UserSettings> {
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
