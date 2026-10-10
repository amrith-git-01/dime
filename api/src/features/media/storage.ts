import { ServiceUnavailableError, UpstreamError } from '../../core/errors';
import { getConfig } from '../../core/env';
import type { Bindings } from '../../core/env';
import { log } from '../../core/logging';
import { buildObjectPath } from './paths';
import type { UploadKind } from './paths';
import { storedMediaKey } from './refs';

/** The R2 bucket plus what is needed to mint links to it. Build one with `mediaStore(env)`. */
export interface MediaStore {
  bucket: R2Bucket;
  /** HMAC key material for private links. Undefined = signing is unavailable (links come back null). */
  secret: string | undefined;
  /** The Worker's public origin, without a trailing slash. */
  baseUrl: string;
}

/** Cheap (no I/O): the `MEDIA` binding plus config. Safe to call per request or per queue batch. */
export function mediaStore(env: Bindings): MediaStore {
  const config = getConfig(env);
  return { bucket: env.MEDIA, secret: config.mediaUrlSecret, baseUrl: config.publicBaseUrl };
}

// --- HMAC signing -------------------------------------------------------------------------------

const encoder = new TextEncoder();
let cachedKey: { secret: string; key: Promise<CryptoKey> } | undefined;

/** HMAC key imported once per isolate (and again only if the secret changes). */
function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
    };
  }
  return cachedKey.key;
}

const signingInput = (key: string, exp: number) => encoder.encode(`${key}\n${exp}`);

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time check of `sig` (hex HMAC-SHA256 of `key\nexp`). Does not look at the clock. */
export async function verifyMediaSignature(secret: string, key: string, exp: number, sig: string): Promise<boolean> {
  const bytes = fromHex(sig);
  if (!bytes) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, signingInput(key, exp));
}

/** `<origin>/media/<key>?exp=<unix>&sig=<hex>`, valid for `expiresIn` seconds. */
export async function signMediaKey(store: MediaStore, key: string, expiresIn: number, nowMs = Date.now()): Promise<string> {
  if (!store.secret) throw new ServiceUnavailableError('Server missing MEDIA_URL_SECRET (required for private media links).');
  const exp = Math.floor(nowMs / 1000) + expiresIn;
  const sig = toHex(await crypto.subtle.sign('HMAC', await hmacKey(store.secret), signingInput(key, exp)));
  return `${mediaPublicUrl(store, key)}?exp=${exp}&sig=${sig}`;
}

/** Unsigned Worker URL of an object (avatars are public). */
export function mediaPublicUrl(store: MediaStore, key: string): string {
  return `${store.baseUrl}/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export interface SignOptions {
  expiresIn: number;
}

/**
 * Sign stored media refs: `{stored value: signed URL | null}`. Signing is local (no subrequest). An
 * unusable ref, or a missing secret, maps to null so it never breaks the surrounding API response.
 */
export async function signMediaUrls(
  store: MediaStore,
  storedValues: readonly (string | null | undefined)[],
  options: SignOptions,
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!store.secret) {
    if (storedValues.some(Boolean)) log.warn('media_signing_unavailable', { reason: 'MEDIA_URL_SECRET is not set' });
    for (const stored of storedValues) if (stored) result.set(stored, null);
    return result;
  }
  const keys = new Map<string, Promise<string>>(); // one signature per distinct key
  const pending: [string, Promise<string> | null][] = [];
  for (const stored of storedValues) {
    if (!stored || result.has(stored)) continue;
    result.set(stored, null);
    const key = storedMediaKey(stored);
    if (!key) continue;
    let url = keys.get(key);
    if (!url) {
      url = signMediaKey(store, key, options.expiresIn);
      keys.set(key, url);
    }
    pending.push([stored, url]);
  }
  await Promise.all(
    pending.map(async ([stored, url]) => {
      try {
        result.set(stored, await url);
      } catch (err) {
        log.warn('media_signing_failed', { err });
      }
    }),
  );
  return result;
}

// --- objects ------------------------------------------------------------------------------------

/** Write one object (overwrites). Failures surface as a 502. */
export async function putMedia(store: MediaStore, key: string, bytes: Uint8Array | ArrayBuffer, contentType: string): Promise<void> {
  try {
    await store.bucket.put(key, bytes, { httpMetadata: { contentType } });
  } catch (err) {
    log.error('media_upload_failed', { err, key });
    throw new UpstreamError('Could not store media.');
  }
}

export interface UploadInput {
  userId: string;
  kind: UploadKind;
  bytes: Uint8Array | ArrayBuffer;
  contentType: string;
  extension?: string | null;
}

/** Upload raw media under a fresh key; returns the key to store on the row. */
export async function uploadMedia(store: MediaStore, input: UploadInput): Promise<string> {
  const key = buildObjectPath({ kind: input.kind, userId: input.userId, extension: input.extension });
  await putMedia(store, key, input.bytes, input.contentType);
  return key;
}

/** Read a stored object (jobs keep only the key, never the media bytes). A missing object is an upstream error. */
export async function downloadMedia(store: MediaStore, key: string): Promise<Uint8Array> {
  let object: R2ObjectBody | null;
  try {
    object = await store.bucket.get(key);
  } catch (err) {
    throw new UpstreamError('Could not read stored media.', { cause: err });
  }
  if (!object) throw new UpstreamError('Could not read stored media.');
  return new Uint8Array(await object.arrayBuffer());
}

/** Best-effort cleanup (e.g. an upload whose job was a replay); never throws. R2 deletes of a missing key succeed. */
export async function deleteMediaQuietly(store: MediaStore, key: string): Promise<void> {
  try {
    await store.bucket.delete(key);
  } catch (err) {
    log.warn('media_cleanup_failed', { key, err });
  }
}
