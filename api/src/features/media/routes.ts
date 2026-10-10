import { Hono } from 'hono';
import type { Context } from 'hono';

import type { AppBindings } from '../../core/env';
import { ServiceUnavailableError } from '../../core/errors';
import { isPublicMediaKey, isValidMediaKey } from './refs';
import { mediaStore, verifyMediaSignature } from './storage';

/**
 * Mounted at `/media`, outside `/api/v1`: no auth middleware. Avatars (`avatars/...`) are public;
 * receipts and voice notes need `?exp=<unix>&sig=<hex HMAC-SHA256(MEDIA_URL_SECRET, key + "\n" + exp)>`
 * as minted by `signMediaKey`. GET / HEAD only; the bucket is never listed.
 */
export const mediaRoutes = new Hono<AppBindings>();

const NOT_FOUND = { detail: 'Not Found' };
const FORBIDDEN = { detail: 'Invalid or expired link' };

/** Avatar URLs carry `?v=<ms>` (unique per upload), so those responses can be cached forever. */
const AVATAR_VERSIONED = 'public, max-age=31536000, immutable';
const AVATAR_UNVERSIONED = 'public, max-age=86400';

function keyOf(c: Context<AppBindings>): string | null {
  const raw = new URL(c.req.url).pathname.slice('/media/'.length);
  let key: string;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return isValidMediaKey(key) ? key : null;
}

mediaRoutes.on(['GET', 'HEAD'], '/*', async (c) => {
  const key = keyOf(c);
  if (!key) return c.json(NOT_FOUND, 404);
  const url = new URL(c.req.url);

  let cacheControl: string;
  if (isPublicMediaKey(key)) {
    cacheControl = url.searchParams.has('v') ? AVATAR_VERSIONED : AVATAR_UNVERSIONED;
  } else {
    const store = mediaStore(c.env);
    if (!store.secret) throw new ServiceUnavailableError('Server missing MEDIA_URL_SECRET (required for private media).');
    const expParam = url.searchParams.get('exp') ?? '';
    const sig = url.searchParams.get('sig') ?? '';
    if (!/^\d{1,12}$/.test(expParam) || !sig) return c.json(FORBIDDEN, 403);
    const exp = Number(expParam);
    // Check the signature first, then the clock: both answer the same 403.
    if (!(await verifyMediaSignature(store.secret, key, exp, sig))) return c.json(FORBIDDEN, 403);
    const remaining = exp - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return c.json(FORBIDDEN, 403);
    cacheControl = `private, max-age=${remaining}`;
  }

  const bucket = c.env.MEDIA;
  const head: Record<string, string> = { 'cache-control': cacheControl, 'x-content-type-options': 'nosniff' };

  if (c.req.method === 'HEAD') {
    const meta = await bucket.head(key);
    if (!meta) return c.json(NOT_FOUND, 404);
    return new Response(null, {
      headers: { ...head, 'content-type': meta.httpMetadata?.contentType ?? 'application/octet-stream', etag: meta.httpEtag, 'content-length': String(meta.size) },
    });
  }

  // `onlyIf` evaluates If-None-Match / If-Modified-Since inside R2: a hit comes back without a body.
  const object = await bucket.get(key, { onlyIf: c.req.raw.headers });
  if (!object) return c.json(NOT_FOUND, 404);
  if (!('body' in object)) return new Response(null, { status: 304, headers: { ...head, etag: object.httpEtag } });
  return new Response(object.body, {
    headers: { ...head, 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream', etag: object.httpEtag },
  });
});

mediaRoutes.all('/*', (c) => c.json({ detail: 'Method Not Allowed' }, 405, { allow: 'GET, HEAD' }));
