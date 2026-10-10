/**
 * Stored media references. Rows hold a bare R2 object key; legacy rows (Supabase era) hold a full
 * Supabase Storage URL, and avatars hold the Worker's own `/media/...` URL. All resolve to a key.
 */
const SUPABASE_MARKERS = ['/object/public/', '/object/authenticated/', '/object/sign/'] as const;

/** Prefixes served by `GET /media/*`: avatars are public, the others need a signed URL. */
export const PUBLIC_PREFIXES = ['avatars/'] as const;
export const PRIVATE_PREFIXES = ['receipts/', 'voice_inputs/'] as const;

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** A key we will read or sign: a known prefix, no empty / `.` / `..` segments, no backslashes or control characters. */
export function isValidMediaKey(key: string): boolean {
  if (!key || key.length > 512 || key.includes('\\') || [...key].some((ch) => ch.charCodeAt(0) < 32)) return false;
  if (!PUBLIC_PREFIXES.some((p) => key.startsWith(p)) && !PRIVATE_PREFIXES.some((p) => key.startsWith(p))) return false;
  return key.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}

export const isPublicMediaKey = (key: string): boolean => PUBLIC_PREFIXES.some((p) => key.startsWith(p));

/** The R2 key for a stored `receipt_url` / `voice_url` value, or null when it is unusable. */
export function storedMediaKey(stored: string): string | null {
  const value = stored.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    const key = value.replace(/^\/+/, '');
    return isValidMediaKey(key) ? key : null;
  }

  let path: string;
  try {
    path = new URL(value).pathname;
  } catch {
    return null;
  }
  // Worker URL: /media/<key>
  if (path.startsWith('/media/')) {
    const key = decode(path.slice('/media/'.length));
    return isValidMediaKey(key) ? key : null;
  }
  // Supabase URL: /storage/v1/object/{public|authenticated|sign}/<bucket>/<key>
  for (const marker of SUPABASE_MARKERS) {
    const at = path.indexOf(marker);
    if (at < 0) continue;
    const rest = path.slice(at + marker.length);
    const slash = rest.indexOf('/');
    if (slash <= 0) continue;
    const key = decode(rest.slice(slash + 1));
    if (isValidMediaKey(key)) return key;
  }
  return null;
}
