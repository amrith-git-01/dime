import { hmacSha256Hex, safeEqual } from '../../core/crypto';

/**
 * Signed unsubscribe tokens. The format is the Python one byte for byte so links in emails that were
 * already sent keep working: `<user_id>|<kind>|<issued_unix>|<hmac_sha256_hex>` where the HMAC (key =
 * `EMAIL_UNSUBSCRIBE_SECRET`, UTF-8) covers `<user_id>|<kind>|<issued_unix>`. Tokens expire after 90 days.
 */

export type DigestKind = 'weekly' | 'monthly';

const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

/** `EMAIL_UNSUBSCRIBE_SECRET` is not configured, so tokens can be neither issued nor verified. */
export class UnsubscribeSecretError extends Error {
  override name = 'UnsubscribeSecretError';
}

function requireSecret(secret: string | undefined | null): string {
  if (!secret || !secret.trim()) {
    throw new UnsubscribeSecretError('EMAIL_UNSUBSCRIBE_SECRET is not set; cannot issue or verify unsubscribe tokens.');
  }
  return secret;
}

export async function signUnsubscribeToken(input: {
  secret: string | undefined | null;
  userId: string;
  kind: DigestKind;
  nowTs?: number;
}): Promise<string> {
  const secret = requireSecret(input.secret);
  const issued = input.nowTs ?? Math.floor(Date.now() / 1000);
  const payload = `${input.userId}|${input.kind}|${issued}`;
  return `${payload}|${await hmacSha256Hex(secret, payload)}`;
}

export async function verifyUnsubscribeToken(input: {
  secret: string | undefined | null;
  token: string;
  nowTs?: number;
}): Promise<{ userId: string; kind: DigestKind } | null> {
  const secret = requireSecret(input.secret);
  const parts = input.token.split('|');
  if (parts.length !== 4) return null;
  const [userId = '', kind = '', issuedRaw = '', given = ''] = parts;
  if (kind !== 'weekly' && kind !== 'monthly') return null;
  if (!/^\s*[+-]?\d+\s*$/.test(issuedRaw)) return null;
  const issued = Number(issuedRaw);
  const now = input.nowTs ?? Math.floor(Date.now() / 1000);
  if (now - issued > MAX_AGE_SECONDS || issued > now + CLOCK_SKEW_SECONDS) return null;
  const expected = await hmacSha256Hex(secret, `${userId}|${kind}|${issued}`);
  if (!(await safeEqual(expected, given))) return null;
  return { userId, kind };
}

/** `<public base>/api/v1/email/unsubscribe?token=...` (form-encoded like Python's `urlencode`). */
export function unsubscribeUrl(input: { publicBase: string; token: string }): string {
  const base = input.publicBase.replace(/\/+$/, '');
  return `${base}/api/v1/email/unsubscribe?${new URLSearchParams({ token: input.token }).toString()}`;
}
