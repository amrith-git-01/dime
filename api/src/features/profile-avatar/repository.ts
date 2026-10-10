import { UpstreamError } from '../../core/errors';
import { log } from '../../core/logging';
import { nowIso, run } from '../../core/db';
import type { Db } from '../../core/db';
import { mediaPublicUrl, putMedia } from '../media/storage';
import type { MediaStore } from '../media/storage';

/**
 * Store the object in R2 (overwriting the user's previous avatar) and point `users.avatar_url` at
 * the Worker's public `/media/...` URL. The URL carries a `v=<ms>` cache buster so clients refetch.
 */
export async function storeAvatar(
  db: Db,
  store: MediaStore,
  input: { userId: string; objectPath: string; bytes: Uint8Array; contentType: string; version: number },
): Promise<string> {
  try {
    await putMedia(store, input.objectPath, input.bytes, input.contentType);
  } catch (err) {
    log.error('avatar_storage_upload_failed', { err, userId: input.userId });
    throw new UpstreamError('Could not store image.');
  }

  const avatarUrl = `${mediaPublicUrl(store, input.objectPath)}?v=${input.version}`;

  try {
    await run(db, 'UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', [avatarUrl, nowIso(), input.userId]);
  } catch (err) {
    log.error('avatar_url_update_failed', { err, userId: input.userId });
    throw new UpstreamError('Image stored but profile could not be updated.');
  }
  return avatarUrl;
}
