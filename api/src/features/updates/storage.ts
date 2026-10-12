import { z } from 'zod';

/**
 * R2 layout under `updates/` (written by `frontend/scripts/publish-update.mjs`, never by the Worker):
 *
 *   updates/<channel>/<runtimeVersion>/<platform>/latest.json   pointer: {"type":"update"|"rollback","id":"<uuid>"}
 *   updates/builds/<id>/manifest.json                           exact manifest bytes (the signature covers them)
 *   updates/builds/<id>/directive.json                          rollBackToEmbedded directive bytes (rollback pointers)
 *   updates/builds/<id>/signature                               `expo-signature` header value for that body
 *   updates/assets/<sha256 base64url>                           launch bundle and assets, content addressed
 *
 * `/media/*` only serves the avatars/receipts/voice_inputs prefixes (media/refs.ts), so it cannot reach any of these.
 */
export const PLATFORMS = ['android', 'ios'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CHANNEL_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const RUNTIME_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
export const UPDATE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** base64url SHA-256 without padding. */
export const ASSET_HASH_RE = /^[A-Za-z0-9_-]{43}$/;

const pointerSchema = z.object({ type: z.enum(['update', 'rollback']), id: z.string().regex(UPDATE_ID_RE) });
export type LatestPointer = z.infer<typeof pointerSchema>;

export const pointerKey = (channel: string, runtimeVersion: string, platform: Platform) =>
  `updates/${channel}/${runtimeVersion}/${platform}/latest.json`;
export const buildKey = (id: string, file: 'manifest.json' | 'directive.json' | 'signature') => `updates/builds/${id}/${file}`;
export const assetKey = (hash: string) => `updates/assets/${hash}`;

/** The published pointer, or null when nothing was published (or the file is malformed). */
export async function readPointer(bucket: R2Bucket, key: string): Promise<LatestPointer | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    return pointerSchema.parse(JSON.parse(await object.text()));
  } catch {
    return null;
  }
}
