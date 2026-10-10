import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { decodeProtectedHeader, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

import { getConfig } from './env';
import type { AppBindings } from './env';
import { ServiceUnavailableError, UnauthorizedError } from './errors';
import { log } from './logging';

export interface AuthUser {
  id: string;
  email: string | undefined;
  /** Raw bearer token (kept for callers that forward it). */
  accessToken: string;
}

let keyCache: { secret: string; key: Uint8Array } | undefined;

/** HS256 key bytes for `AUTH_JWT_SECRET`, encoded once per isolate. */
export function jwtKey(secret: string | undefined): Uint8Array {
  if (!secret) throw new ServiceUnavailableError('Auth is not configured (missing AUTH_JWT_SECRET).');
  if (keyCache?.secret !== secret) keyCache = { secret, key: new TextEncoder().encode(secret) };
  return keyCache.key;
}

export const ACCESS_TOKEN_ISSUER = 'dime-api';
export const ACCESS_TOKEN_AUDIENCE = 'authenticated';

const INVALID = 'Invalid or expired token.';

/** Verify a Worker-issued access token (HS256 only). Stateless: a revoked session's access token lives until `exp`. */
export async function verifyAccessToken(token: string, secret: string | undefined): Promise<JWTPayload> {
  let alg: string;
  try {
    alg = decodeProtectedHeader(token).alg ?? 'HS256';
  } catch {
    throw new UnauthorizedError(INVALID);
  }
  if (alg !== 'HS256') throw new UnauthorizedError('Unsupported token signing algorithm.');
  const key = jwtKey(secret);
  try {
    const { payload } = await jwtVerify(token, key, {
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: ACCESS_TOKEN_ISSUER,
      algorithms: ['HS256'],
      requiredClaims: ['exp', 'sub', 'iss', 'aud'],
    });
    return payload;
  } catch (err) {
    if (!(err instanceof joseErrors.JOSEError)) log.error('jwt_verify_failed', { err });
    throw new UnauthorizedError(INVALID);
  }
}

/**
 * Requires `Authorization: Bearer <Worker-issued access token>`; sets `c.var.user`.
 * Mount per feature router: `router.use(requireAuth)`.
 */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  // Idempotent: sibling routers mounted under a shared prefix (e.g. /me and /me/settings) each
  // declare `use(requireAuth)`, so the token must only be verified once per request.
  if (c.get('user')) {
    await next();
    return;
  }
  const header = c.req.header('Authorization');
  const space = header?.indexOf(' ') ?? -1;
  if (!header || space < 0 || header.slice(0, space).toLowerCase() !== 'bearer') {
    throw new UnauthorizedError('Not authenticated.');
  }
  const token = header.slice(space + 1).trim();
  if (!token) throw new UnauthorizedError('Not authenticated.');

  const payload = await verifyAccessToken(token, getConfig(c.env).auth.jwtSecret);
  const sub = payload.sub;
  if (typeof sub !== 'string' || !sub) throw new UnauthorizedError('Invalid token subject.');

  c.set('user', {
    id: sub,
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    accessToken: token,
  });
  if (typeof payload['sid'] === 'string') c.set('sessionId', payload['sid']);
  await next();
});

/** The authenticated user. Only valid on routes behind `requireAuth`. */
export function currentUser(c: Context<AppBindings>): AuthUser {
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated.');
  return user;
}
