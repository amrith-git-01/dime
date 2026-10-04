/**
 * Stored media references. New rows hold a bare object path in the private bucket; legacy rows hold
 * a full Supabase Storage URL. Port of `split_stored_media_ref` in backend `features/uploads/storage.py`.
 */
const URL_MARKERS = ['/object/public/', '/object/authenticated/', '/object/sign/'] as const;

export interface MediaRef {
  bucket: string;
  objectPath: string;
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** `{bucket, objectPath}` for a stored `receipt_url` / `voice_url` value, or null when it is unusable. */
export function splitStoredMediaRef(stored: string, defaultBucket: string): MediaRef | null {
  const value = stored.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return { bucket: defaultBucket, objectPath: value.replace(/^\/+/, '') };

  let path: string;
  try {
    path = new URL(value).pathname;
  } catch {
    return null;
  }
  for (const marker of URL_MARKERS) {
    const at = path.indexOf(marker);
    if (at < 0) continue;
    const rest = path.slice(at + marker.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) continue;
    const bucket = rest.slice(0, slash);
    const objectPath = rest.slice(slash + 1);
    if (bucket && objectPath) return { bucket: decode(bucket), objectPath: decode(objectPath) };
  }
  return null;
}
