import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, decodeProtectedHeader, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTPayload, JWTVerifyOptions } from 'jose';

import { getConfig } from './env';
import type { AppBindings } from './env';
import { ServiceUnavailableError, UnauthorizedError } from './errors';
import { log } from './logging';

export interface AuthUser {
  id: string;
  email: string | undefined;
  /** Raw bearer token, for user-scoped Supabase clients (RLS) or forwarding. */
  accessToken: string;
}

type Jwks = ReturnType<typeof createRemoteJWKSet>;

// Module scope = one JWKS cache per isolate. jose caches keys (10 min) and refetches on unknown kid
// with a cooldown, so steady-state verification makes no subrequests.
const jwksByUrl = new Map<string, Jwks>();

function getJwks(supabaseUrl: string): Jwks {
  let jwks = jwksByUrl.get(supabaseUrl);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`), {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
    });
    jwksByUrl.set(supabaseUrl, jwks);
  }
  return jwks;
}

let hsKeyCache: { secret: string; key: Uint8Array } | undefined;

function hsKey(secret: string): Uint8Array {
  if (hsKeyCache?.secret !== secret) hsKeyCache = { secret, key: new TextEncoder().encode(secret) };
  return hsKeyCache.key;
}

const INVALID = 'Invalid or expired token.';

/** Verify a Supabase access token. Mirrors backend/core/security.py. */
export async function verifyAccessToken(
  token: string,
  config: { supabaseUrl: string; supabaseJwtSecret: string | undefined },
): Promise<JWTPayload> {
  const options: JWTVerifyOptions = {
    audience: 'authenticated',
    issuer: `${config.supabaseUrl}/auth/v1`,
    requiredClaims: ['exp', 'sub', 'iss', 'aud'],
  };

  let alg: string;
  try {
    alg = decodeProtectedHeader(token).alg ?? 'HS256';
  } catch {
    throw new UnauthorizedError(INVALID);
  }

  try {
    if (alg === 'ES256' || alg === 'RS256') {
      const { payload } = await jwtVerify(token, getJwks(config.supabaseUrl), {
        ...options,
        algorithms: [alg],
      });
      return payload;
    }
    if (alg !== 'HS256') throw new UnauthorizedError('Unsupported token signing algorithm.');
    if (!config.supabaseJwtSecret) {
      throw new ServiceUnavailableError('Auth is not configured (missing SUPABASE_JWT_SECRET).');
    }
    const { payload } = await jwtVerify(token, hsKey(config.supabaseJwtSecret), {
      ...options,
      algorithms: ['HS256'],
    });
    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ServiceUnavailableError) throw err;
    // Key set unreachable is our/Supabase's problem, not the client's: do not make the app sign the user out.
    if (err instanceof joseErrors.JWKSTimeout) {
      log.error('jwks_unavailable', { err });
      throw new ServiceUnavailableError('Auth keys are temporarily unavailable.', 5);
    }
    if (err instanceof joseErrors.JOSEError) throw new UnauthorizedError(INVALID);
    // Network failure while fetching JWKS surfaces as a plain error.
    log.error('jwt_verify_failed', { err });
    throw new ServiceUnavailableError('Auth keys are temporarily unavailable.', 5);
  }
}

/**
 * Requires `Authorization: Bearer <supabase access token>`; sets `c.var.user`.
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

  const payload = await verifyAccessToken(token, getConfig(c.env));
  const sub = payload.sub;
  if (typeof sub !== 'string' || !sub) throw new UnauthorizedError('Invalid token subject.');

  c.set('user', {
    id: sub,
    email: typeof payload['email'] === 'string' ? payload['email'] : undefined,
    accessToken: token,
  });
  await next();
});

/** The authenticated user. Only valid on routes behind `requireAuth`. */
export function currentUser(c: Context<AppBindings>): AuthUser {
  const user = c.get('user');
  if (!user) throw new UnauthorizedError('Not authenticated.');
  return user;
}
