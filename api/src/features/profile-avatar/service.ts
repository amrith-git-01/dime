import { BadRequestError } from '../../core/errors';
import { detectImageFormat } from '../../core/image-format';
import type { DimeSupabaseClient } from '../../core/supabase';
import * as repo from './repository';
import { MAX_AVATAR_BYTES } from './schemas';

/** Validate the bytes (size + magic bytes: JPEG, PNG, WebP) and store them as the user's avatar. */
export async function uploadAvatar(
  db: DimeSupabaseClient,
  input: { userId: string; bytes: Uint8Array; bucket: string; now?: () => number },
): Promise<string> {
  if (input.bytes.byteLength === 0) throw new BadRequestError('Empty file.');
  if (input.bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new BadRequestError(`Image too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)} MB).`);
  }
  const detected = detectImageFormat(input.bytes.subarray(0, 32));
  if (!detected) throw new BadRequestError('Unsupported image type (use JPEG, PNG, or WebP).');

  return repo.storeAvatar(db, {
    userId: input.userId,
    bucket: input.bucket,
    objectPath: `avatars/${input.userId}/avatar.${detected.ext}`,
    bytes: input.bytes,
    contentType: detected.contentType,
    version: (input.now ?? Date.now)(),
  });
}
