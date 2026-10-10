import { SignJWT, createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER, jwtKey } from '../../core/auth';
import { newId } from '../../core/db';
import type { Db } from '../../core/db';
import { ServiceUnavailableError, UnauthorizedError } from '../../core/errors';
import { log } from '../../core/logging';
import * as repo from './repository';
import type { SessionResponse } from './schemas';

export const ACCESS_TTL_SECONDS = 3600;
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** See `refresh`: a token rotated this recently is a retry/double-fire, not theft. */
const ROTATION_GRACE_MS = 30_000;

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
// Module scope = one key cache per isolate (jose caches keys and cools down refetches).
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), {
  timeoutDuration: 5000,
  cooldownDuration: 30_000,
});

const INVALID_GOOGLE = 'Invalid Google ID token.';
const INVALID_REFRESH = 'Invalid refresh token.';

export interface GoogleIdentity {
  subject: string;
  email: string;
}

/** Verify a Google ID token (signature, issuer, audience, expiry) and require a verified email. */
export async function verifyGoogleIdToken(idToken: string, clientIds: string[]): Promise<GoogleIdentity> {
  if (clientIds.length === 0) throw new ServiceUnavailableError('Sign-in is not configured (missing GOOGLE_WEB_CLIENT_ID).');
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, googleJwks, {
      issuer: GOOGLE_ISSUERS,
      audience: clientIds,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'sub'],
    }));
  } catch (err) {
    if (err instanceof joseErrors.JOSEError && !(err instanceof joseErrors.JWKSTimeout)) throw new UnauthorizedError(INVALID_GOOGLE);
    // Google's key set unreachable is not the client's fault: do not make the app discard its sign-in.
    log.error('google_jwks_unavailable', { err });
    throw new ServiceUnavailableError('Google sign-in is temporarily unavailable.', 5);
  }
  const verified = payload['email_verified'] === true || payload['email_verified'] === 'true';
  const email = payload['email'];
  if (!verified || typeof email !== 'string' || !email || !payload.sub) throw new UnauthorizedError(INVALID_GOOGLE);
  return { subject: payload.sub, email };
}

const b64url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Minted {
  id: string;
  refreshToken: string;
  refreshHash: string;
  expiresAt: string;
}

async function mint(): Promise<Minted> {
  const refreshToken = b64url(crypto.getRandomValues(new Uint8Array(32)));
  return {
    id: newId(),
    refreshToken,
    refreshHash: await sha256Hex(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS).toISOString(),
  };
}

async function toResponse(
  secret: string | undefined,
  user: { id: string; email: string | null },
  sessionId: string,
  refreshToken: string,
): Promise<SessionResponse> {
  const key = jwtKey(secret);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ACCESS_TTL_SECONDS;
  const accessToken = await new SignJWT({ ...(user.email ? { email: user.email } : {}), sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(key);
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: ACCESS_TTL_SECONDS,
    expires_at: exp,
    refresh_token: refreshToken,
    user: { id: user.id, email: user.email },
  };
}

/**
 * Google sign-in. Identity (google, sub) -> user; a first sign-in links to an existing account with the
 * same email, else creates one. The `users` row exists from here on (other tables have FKs to it);
 * "not onboarded yet" is `users.username IS NULL`, not row absence (see user-profile/service.ts).
 */
export async function signInWithGoogle(
  db: Db,
  config: { jwtSecret: string | undefined; googleClientIds: string[] },
  idToken: string,
): Promise<SessionResponse> {
  jwtKey(config.jwtSecret); // 503 before any work if the deployment is unconfigured
  const google = await verifyGoogleIdToken(idToken, config.googleClientIds);

  let userId = await repo.findIdentityUser(db, 'google', google.subject);
  if (!userId) {
    const identity = { provider: 'google', subject: google.subject, email: google.email };
    const linkTo = await repo.findUserIdByEmail(db, google.email);
    if (linkTo) {
      await repo.linkIdentity(db, { ...identity, userId: linkTo });
      userId = linkTo;
    } else {
      const created = newId();
      try {
        await repo.createUserWithIdentity(db, { ...identity, userId: created });
        userId = created;
      } catch (err) {
        // A concurrent first sign-in won the identity (its transaction, user row included, committed).
        userId = await repo.findIdentityUser(db, 'google', google.subject);
        if (!userId) throw err;
      }
    }
  }

  const session = await mint();
  await repo.insertSession(db, {
    id: session.id,
    userId,
    refreshHash: session.refreshHash,
    familyId: newId(),
    expiresAt: session.expiresAt,
  });
  // The token's email is Google's verified one; GET /me reports the email from the token.
  return toResponse(config.jwtSecret, { id: userId, email: google.email }, session.id, session.refreshToken);
}

/**
 * Refresh-token rotation with reuse detection.
 *
 * ponytail: a rotated token presented again is either theft or a mobile retry/double-fire (response
 * lost, or two requests raced). Within ROTATION_GRACE_MS of the rotation it is answered like a normal
 * refresh: a fresh child in the same family (only while the family still has a live session, so a sign-out
 * in between wins), so a client that never saw the first response stays signed in. An older replay
 * revokes the whole family. Cost: a token stolen and replayed inside the 30 s window gets a session too.
 */
export async function refresh(db: Db, secret: string | undefined, refreshToken: string): Promise<SessionResponse> {
  jwtKey(secret);
  const row = await repo.findByRefreshHash(db, await sha256Hex(refreshToken));
  if (!row) throw new UnauthorizedError(INVALID_REFRESH);

  const now = new Date().toISOString();
  if (row.revoked_at) {
    const recentRotation = row.replaced_by !== null && Date.now() - Date.parse(row.revoked_at) < ROTATION_GRACE_MS;
    if (!recentRotation || row.expires_at <= now) {
      if (!recentRotation) await repo.revokeFamily(db, row.family_id);
      throw new UnauthorizedError(INVALID_REFRESH);
    }
    const email = await repo.userEmail(db, row.user_id);
    const child = await mint();
    const minted = await repo.insertGraceChild(db, {
      id: child.id,
      userId: row.user_id,
      refreshHash: child.refreshHash,
      familyId: row.family_id,
      expiresAt: child.expiresAt,
    });
    if (!minted) throw new UnauthorizedError(INVALID_REFRESH); // the family was signed out meanwhile
    return toResponse(secret, { id: row.user_id, email }, child.id, child.refreshToken);
  }
  if (row.expires_at <= now) throw new UnauthorizedError(INVALID_REFRESH);

  const email = await repo.userEmail(db, row.user_id);
  const next = await mint();
  const won = await repo.rotate(db, row.id, {
    id: next.id,
    userId: row.user_id,
    refreshHash: next.refreshHash,
    familyId: row.family_id,
    expiresAt: next.expiresAt,
  });
  if (!won) return refresh(db, secret, refreshToken); // lost the race to a concurrent refresh of this token: it is now a grace replay
  return toResponse(secret, { id: row.user_id, email }, next.id, next.refreshToken);
}

export async function signOut(
  db: Db,
  user: { id: string },
  body: { scope: 'global' | 'local'; refresh_token?: string | undefined },
  currentSessionId: string | undefined,
): Promise<void> {
  if (body.scope === 'global') {
    await repo.revokeAllForUser(db, user.id);
  } else if (body.refresh_token) {
    await repo.revokeSession(db, user.id, { refreshHash: await sha256Hex(body.refresh_token) });
  } else if (currentSessionId) {
    await repo.revokeSession(db, user.id, { id: currentSessionId });
  }
}
