import type { DimeSupabaseClient } from '../../core/supabase';
import { USER_COLUMNS } from './schemas';
import type { UserRow } from './schemas';

/** `public.users` access. Always scoped by the JWT user id (the service role bypasses RLS). */
export async function fetchById(db: DimeSupabaseClient, userId: string): Promise<UserRow | null> {
  const { data } = await db
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
    .throwOnError()
    .overrideTypes<UserRow, { merge: false }>();
  return data;
}

/** Fetch only `username` (feedback reporter name). */
export async function fetchUsername(db: DimeSupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from('users')
    .select('username')
    .eq('id', userId)
    .maybeSingle()
    .throwOnError()
    .overrideTypes<{ username: string | null }, { merge: false }>();
  return data?.username ?? null;
}

/** Insert-or-update the profile and return the stored row: one round trip (`return=representation`). */
export async function upsertProfile(
  db: DimeSupabaseClient,
  input: { userId: string; username: string; currency: string; avatarUrl: string | null },
): Promise<UserRow> {
  const row: Record<string, string> = { id: input.userId, username: input.username, currency: input.currency };
  if (input.avatarUrl !== null) row['avatar_url'] = input.avatarUrl;
  const { data } = await db
    .from('users')
    .upsert(row, { onConflict: 'id' })
    .select(USER_COLUMNS)
    .single()
    .throwOnError()
    .overrideTypes<UserRow, { merge: false }>();
  return data;
}

export async function updateEmailIfRowExists(db: DimeSupabaseClient, userId: string, email: string): Promise<void> {
  await db.from('users').update({ email }).eq('id', userId).throwOnError();
}
