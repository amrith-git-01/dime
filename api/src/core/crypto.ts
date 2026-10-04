const encoder = new TextEncoder();

/** `crypto.subtle.timingSafeEqual` exists on Workers (non-standard); fall back to a manual XOR loop elsewhere. */
type TimingSafeSubtle = SubtleCrypto & { timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean };

/**
 * Constant-time string equality for secrets (cron secret, HMAC digests). Both sides are hashed with
 * SHA-256 first so the comparison always runs over two equal-length buffers and the secret's length
 * does not leak through an early exit.
 */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const subtle = crypto.subtle as TimingSafeSubtle;
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(da, db);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Lower-case hex HMAC-SHA256 of `message` under `secret` (UTF-8). */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
