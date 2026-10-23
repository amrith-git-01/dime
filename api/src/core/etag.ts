import { createMiddleware } from 'hono/factory';

import type { AppBindings } from './env';

/** Base64url of a SHA-1 digest: short, header-safe, and plenty for a change detector (not a security boundary). */
async function bodyHash(body: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', body));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Weak comparison (RFC 9110 8.8.3.2): the `W/` prefix is ignored on both sides. */
function stripWeak(tag: string): string {
  return tag.startsWith('W/') ? tag.slice(2) : tag;
}

export function ifNoneMatchMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  const value = header.trim();
  if (value === '*') return true;
  const target = stripWeak(etag);
  return value.split(',').some((tag) => stripWeak(tag.trim()) === target);
}

/**
 * Conditional GETs for JSON: a weak `ETag` over the response body, and a bodyless 304 when the
 * client's `If-None-Match` still matches. Responses stay per-user (the body is what is hashed, so two
 * users never share a tag for different data); the saving is the bytes on the wire, not the D1 reads.
 * The responses stay `Cache-Control: private, no-store` (see `noStore`): the tag only saves bytes for a
 * client that sends it back itself (the app keeps its own in-memory bodies); no HTTP cache may keep the data.
 * Registered right after `noStore`, so it finishes first. Streams, upgrades and non-200s are left alone.
 */
export const etag = createMiddleware<AppBindings>(async (c, next) => {
  await next();
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return;
  const res = c.res;
  // A handler with its own cache policy (update manifests and assets) is left exactly as it is.
  if (res.status !== 200 || res.headers.has('ETag') || res.headers.has('Cache-Control') || !res.body) return;
  if (!(res.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) return;

  const tag = `W/"${await bodyHash(await res.clone().arrayBuffer())}"`;
  if (ifNoneMatchMatches(c.req.header('If-None-Match'), tag)) {
    const headers = new Headers(res.headers);
    headers.delete('Content-Type');
    headers.delete('Content-Length');
    headers.set('ETag', tag);
    c.res = new Response(null, { status: 304, headers });
    return;
  }
  c.header('ETag', tag);
});
