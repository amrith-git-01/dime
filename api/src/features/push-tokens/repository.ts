import type { DimeSupabaseClient } from '../../core/supabase';

/** A token belongs to one user: re-registering it on another account moves it (conflict on the token). */
export async function upsert(db: DimeSupabaseClient, userId: string, token: string, platform: string): Promise<string> {
  const { data } = await db
    .from('user_push_tokens')
    .upsert(
      { user_id: userId, expo_push_token: token, platform, updated_at: new Date().toISOString() },
      { onConflict: 'expo_push_token' },
    )
    .select('expo_push_token')
    .single()
    .throwOnError()
    .overrideTypes<{ expo_push_token: string }, { merge: false }>();
  return data.expo_push_token || token;
}

export async function listTokens(db: DimeSupabaseClient, userId: string): Promise<string[]> {
  const { data } = await db
    .from('user_push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .throwOnError()
    .overrideTypes<{ expo_push_token: string | null }[], { merge: false }>();
  return data.map((r) => r.expo_push_token).filter((t): t is string => typeof t === 'string' && t !== '');
}

export async function deleteToken(db: DimeSupabaseClient, userId: string, token: string): Promise<void> {
  await db.from('user_push_tokens').delete().eq('user_id', userId).eq('expo_push_token', token).throwOnError();
}

export async function deleteAllForUser(db: DimeSupabaseClient, userId: string): Promise<void> {
  await db.from('user_push_tokens').delete().eq('user_id', userId).throwOnError();
}

/** Prune a token Expo reported as unregistered (any owner). */
export async function deleteByToken(db: DimeSupabaseClient, token: string): Promise<void> {
  await db.from('user_push_tokens').delete().eq('expo_push_token', token).throwOnError();
}
