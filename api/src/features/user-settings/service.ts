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

/** Fields present and non-null in the patch (null = unchanged, as in Python). `card_layouts` is handled apart. */
function patchFields(body: SettingsPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined && key !== 'card_layouts' && !IGNORED_KEYS.has(key)) out[key] = value;
  }
  return out;
}

/** JSON merge patch for the screens named in the request: an empty list becomes `null` (= back to the default order). */
function cardLayoutsMergePatch(body: SettingsPatch): Record<string, string[] | null> | null {
  const out: Record<string, string[] | null> = {};
  for (const [screen, ids] of Object.entries(body.card_layouts ?? {})) {
    if (ids) out[screen] = ids.length > 0 ? ids : null;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Common case is one round trip: update-with-return. A missing row is created with the patch applied. */
export async function patch(db: Db, userId: string, body: SettingsPatch): Promise<UserSettings> {
  const fields = patchFields(body);
  const layouts = cardLayoutsMergePatch(body);
  if (Object.keys(fields).length === 0 && !layouts) return getOrCreate(db, userId);

  const mergePatch = layouts ? JSON.stringify(layouts) : undefined;
  let row = await repo.update(db, userId, fields, mergePatch);
  if (!row) {
    // A new row has nothing to merge into: store only the screens that were actually arranged.
    const created = layouts ? Object.fromEntries(Object.entries(layouts).filter(([, ids]) => ids !== null)) : {};
    row = await repo.insertDefaults(db, userId, {
      ...fields,
      card_layouts: Object.keys(created).length > 0 ? JSON.stringify(created) : null,
    });
    // Lost a creation race: the row exists now, so apply the patch to it.
    row ??= await repo.update(db, userId, fields, mergePatch);
  }
  return settingsFromRow(row);
}
