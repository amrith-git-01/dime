import { UpstreamError } from '../../core/errors';
import { log } from '../../core/logging';
import type { DimeSupabaseClient } from '../../core/supabase';

/**
 * Store the object in the public bucket (overwriting the user's previous avatar) and point
 * `users.avatar_url` at it. The URL carries a `v=<ms>` cache buster so clients refetch.
 */
export async function storeAvatar(
  db: DimeSupabaseClient,
  input: { userId: string; bucket: string; objectPath: string; bytes: Uint8Array; contentType: string; version: number },
): Promise<string> {
  const bucket = db.storage.from(input.bucket);
  const { error: uploadError } = await bucket.upload(input.objectPath, input.bytes, {
    contentType: input.contentType,
    upsert: true,
  });
  if (uploadError) {
    log.error('avatar_storage_upload_failed', { err: uploadError, userId: input.userId });
    throw new UpstreamError('Could not store image.');
  }

  const publicUrl = bucket.getPublicUrl(input.objectPath).data.publicUrl;
  const avatarUrl = `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}v=${input.version}`;

  const { error: updateError } = await db.from('users').update({ avatar_url: avatarUrl }).eq('id', input.userId);
  if (updateError) {
    log.error('avatar_url_update_failed', { err: updateError, userId: input.userId });
    throw new UpstreamError('Image stored but profile could not be updated.');
  }
  return avatarUrl;
}
