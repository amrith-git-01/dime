import type { Db } from '../../core/db';
import { log } from '../../core/logging';
import { IST, localDate, monthKeyOf, parseTimezone } from '../../core/timezone';
import { replanUserReminders } from '../reminders/replan';
import * as repo from './repository';
import type { SettingsPatch } from './schemas';
import { settingsFromRow } from './snapshot';
import type { UserSettings } from './snapshot';

export async function getOrCreate(db: Db, userId: string): Promise<UserSettings> {
  let row = await repo.fetchByUserId(db, userId);
  if (!row) row = (await repo.insertDefaults(db, userId)) ?? (await repo.fetchByUserId(db, userId));
  return settingsFromRow(row);
}

/**
 * The timezone a server-side surface (a new row's local date, budget alerts, digests, the Broke Report) uses for this user:
 * the one the app stored, else `hint` (the request's or the job's own), else IST. An unknown stored name is skipped.
 */
export async function resolveUserTimezone(db: Db, userId: string, hint?: string | null): Promise<string> {
  const stored = (await repo.fetchTimezone(db, userId)) ?? null;
  for (const candidate of [stored, hint]) {
    if (!candidate) continue;
    try {
      return parseTimezone(candidate);
    } catch {
      // an unknown name falls through to the next candidate
    }
  }
  return IST;
}

/** The user's current calendar month (`YYYY-MM`) in their timezone. */
export async function currentMonthKey(db: Db, userId: string, nowMs: number = Date.now(), hint?: string | null): Promise<string> {
  return monthKeyOf(localDate(await resolveUserTimezone(db, userId, hint), nowMs));
}

/** Keys accepted for old app builds but no longer stored (the daily budget was removed). */
const IGNORED_KEYS: ReadonlySet<string> = new Set(['budget_daily_alerts_enabled', 'budget_daily_warn_pct']);

/** Fields present and non-null in the patch (null = unchanged, as in Python). `card_layouts` is handled apart. */
function patchFields(body: SettingsPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined && key !== 'card_layouts' && key !== 'reminder_default_lead_days' && !IGNORED_KEYS.has(key)) out[key] = value;
  }
  // Stored as JSON text like card_layouts; the UPI id is cleared with '' (null would mean "unchanged"), stored as NULL.
  if (body.reminder_default_lead_days) out['reminder_default_lead_days'] = JSON.stringify(body.reminder_default_lead_days);
  if (out['upi_id'] === '') out['upi_id'] = null;
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

/** Changing any of these changes when reminders are due, so the next instants are re-planned from the new settings. */
const affectsReminders = (key: string): boolean => key.startsWith('reminder_') || key === 'reminders_enabled' || key === 'timezone';

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
  const settings = settingsFromRow(row);
  if (Object.keys(fields).some(affectsReminders)) {
    // The settings are saved: a failing re-plan must not turn the PATCH into an error (each row re-plans itself when it fires).
    await replanUserReminders(db, userId, settings, Date.now()).catch((err: unknown) => log.error('reminders_replan_failed', { err, userId }));
  }
  return settings;
}
