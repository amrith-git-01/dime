import type { DimeSupabaseClient } from '../../core/supabase';
import { DEFAULT_SETTINGS, SETTINGS_COLUMNS } from './snapshot';

export type SettingsRow = Record<string, unknown>;

export async function fetchByUserId(db: DimeSupabaseClient, userId: string): Promise<SettingsRow | null> {
  const { data } = await db
    .from('user_settings')
    .select(SETTINGS_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()
    .throwOnError()
    .overrideTypes<SettingsRow, { merge: false }>();
  return data;
}

/** Insert a row (defaults + overrides). Race-safe: returns null if another request created it first. */
export async function insertDefaults(
  db: DimeSupabaseClient,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<SettingsRow | null> {
  const { data } = await db
    .from('user_settings')
    .upsert({ user_id: userId, ...DEFAULT_SETTINGS, ...overrides }, { onConflict: 'user_id', ignoreDuplicates: true })
    .select(SETTINGS_COLUMNS)
    .throwOnError()
    .overrideTypes<SettingsRow[], { merge: false }>();
  return data[0] ?? null;
}

/** Update and return the row in one call; null when the user has no settings row yet. */
export async function update(
  db: DimeSupabaseClient,
  userId: string,
  patch: Record<string, unknown>,
): Promise<SettingsRow | null> {
  const { data } = await db
    .from('user_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select(SETTINGS_COLUMNS)
    .throwOnError()
    .overrideTypes<SettingsRow[], { merge: false }>();
  return data[0] ?? null;
}
