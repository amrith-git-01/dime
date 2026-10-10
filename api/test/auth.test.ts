import { SignJWT, decodeJwt, exportJWK, generateKeyPair } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { getMe } from '../src/features/user-profile/service';
import { USER_ID, call, makeEnv } from './helpers';
import { oneRow, rowsOf, seedUser, testDb } from './db';
import { json, useSupabaseStub } from './supabase-stub';

// Google's keys are served by a stubbed fetch; D1 is real.
const stub = useSupabaseStub();
const AUD = 'test-web-client.apps.googleusercontent.com';
const KID = 'test-kid';

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
});

function stubGoogleKeys() {
  stub.on('GET', '/oauth2/v3/certs', () => json({ keys: [publicJwk] }));
}

interface GoogleOpts {
  sub?: string;
  email?: string | null;
  email_verified?: boolean;
  aud?: string;
  iss?: string;
  exp?: number;
}

async function googleToken(o: GoogleOpts = {}): Promise<string> {
  const claims: Record<string, unknown> = { email_verified: o.email_verified ?? true };
  if (o.email !== null) claims['email'] = o.email ?? 'new@example.com';
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(o.sub ?? 'google-sub-1')
    .setIssuer(o.iss ?? 'https://accounts.google.com')
    .setAudience(o.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(o.exp ?? Math.floor(Date.now() / 1000) + 600)
    .sign(privateKey);
}

interface Session {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: { id: string; email: string | null };
}

const postAuth = (path: string, body: unknown, extra: { token?: string | false; env?: ReturnType<typeof makeEnv> } = {}) =>
  call(`/api/v1/auth/${path}`, { method: 'POST', json: body, token: extra.token ?? false, env: extra.env ?? makeEnv({ WRITE_LIMITER: undefined }) });

async function signIn(opts: GoogleOpts = {}): Promise<Session> {
  stubGoogleKeys();
  const res = await postAuth('google', { id_token: await googleToken(opts) });
  expect(res.status).toBe(200);
  return await res.json<Session>();
}

const refresh = (token: string) => postAuth('refresh', { refresh_token: token });
const AGED = "UPDATE auth_sessions SET revoked_at = '2020-01-01T00:00:00.000Z' WHERE replaced_by IS NOT NULL";

describe('POST /auth/google', () => {
  it('creates the user, identity and session for a new account', async () => {
    const s = await signIn({ sub: 'g-new', email: 'new@example.com' });
    expect(s.token_type).toBe('bearer');
    expect(s.expires_in).toBe(3600);
    expect(s.user.email).toBe('new@example.com');
    expect(Math.abs(s.expires_at - (Math.floor(Date.now() / 1000) + 3600))).toBeLessThan(5);
    expect(s.refresh_token.length).toBeGreaterThanOrEqual(43);

    expect(await oneRow('users', 'id = ?', s.user.id)).toMatchObject({ email: 'new@example.com', username: null, currency: 'INR' });
    expect(await oneRow('auth_identities', "provider = 'google' AND subject = ?", 'g-new')).toMatchObject({
      user_id: s.user.id,
      email: 'new@example.com',
    });

    const claims = decodeJwt(s.access_token);
    expect(claims).toMatchObject({ sub: s.user.id, email: 'new@example.com', iss: 'dime-api', aud: 'authenticated' });
    expect(typeof claims['sid']).toBe('string');
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(3600);
  });

  it('stores only the hash of the refresh token', async () => {
    const s = await signIn();
    const rows = await rowsOf<{ refresh_hash: string }>('auth_sessions');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refresh_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.refresh_hash).not.toBe(s.refresh_token);
  });

  it('the access token works on authenticated routes', async () => {
    const s = await signIn({ email: 'me@example.com' });
    const res = await call('/api/v1/me', { token: s.access_token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: s.user.id, email: 'me@example.com', username: null, avatar_url: null, currency: null });
  });

  it('a signed-in, not yet onboarded user gets the welcome flow on GET /me (as the old "no row" case did)', async () => {
    const s = await signIn({ email: 'welcome@example.com' });
    const welcomed: string[] = [];
    const me = await getMe(
      testDb(),
      { id: s.user.id, email: 'welcome@example.com' },
      {
        email: { sendWelcomeIfNeeded: (i) => (welcomed.push(i.email), Promise.resolve()) },
        background: (task) => void task,
      },
    );
    expect(welcomed).toEqual(['welcome@example.com']);
    expect(me.currency).toBeNull();
  });

  it('reuses the user on the next sign-in', async () => {
    const a = await signIn({ sub: 'g-again' });
    const b = await signIn({ sub: 'g-again' });
    expect(b.user.id).toBe(a.user.id);
    expect(await rowsOf('users')).toHaveLength(2); // seeded default user + this one
    expect(await rowsOf('auth_sessions')).toHaveLength(2);
  });

  it('links a first sign-in to the existing account with the same email (case-insensitive)', async () => {
    await seedUser('22222222-2222-2222-2222-222222222222', { email: 'Link@Example.com', username: 'linked' });
    const s = await signIn({ sub: 'g-link', email: 'link@example.com' });
    expect(s.user.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(await rowsOf('users')).toHaveLength(2);
    expect(await oneRow('auth_identities', "subject = 'g-link'")).toMatchObject({ user_id: '22222222-2222-2222-2222-222222222222' });
  });

  it('links to the seeded default user by email', async () => {
    await testDb().prepare('UPDATE users SET email = ? WHERE id = ?').bind('default@example.com', USER_ID).run();
    const s = await signIn({ sub: 'g-default', email: 'default@example.com' });
    expect(s.user.id).toBe(USER_ID);
  });

  it('accepts any configured client id', async () => {
    stubGoogleKeys();
    const env = makeEnv({ GOOGLE_WEB_CLIENT_ID: 'android-id, ios-id' });
    const ok = await postAuth('google', { id_token: await googleToken({ aud: 'ios-id' }) }, { env });
    expect(ok.status).toBe(200);
    const bad = await postAuth('google', { id_token: await googleToken({ aud: AUD }) }, { env });
    expect(bad.status).toBe(401);
  });

  const rejected: [string, () => Promise<string>][] = [
    ['wrong audience', () => googleToken({ aud: 'someone-else' })],
    ['wrong issuer', () => googleToken({ iss: 'https://evil.example.com' })],
    ['unverified email', () => googleToken({ email_verified: false })],
    ['missing email', () => googleToken({ email: null })],
    ['expired', () => googleToken({ exp: Math.floor(Date.now() / 1000) - 120 })],
    ['garbage', () => Promise.resolve('not-a-jwt')],
  ];
  it.each(rejected)('rejects %s with 401 and creates nothing', async (_name, make) => {
    stubGoogleKeys();
    const res = await postAuth('google', { id_token: await make() });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Invalid Google ID token.' });
    expect(await rowsOf('auth_sessions')).toHaveLength(0);
    expect(await rowsOf('auth_identities')).toHaveLength(0);
  });

  it('accepts the bare accounts.google.com issuer', async () => {
    stubGoogleKeys();
    const res = await postAuth('google', { id_token: await googleToken({ iss: 'accounts.google.com' }) });
    expect(res.status).toBe(200);
  });

  it('422 for a missing id_token', async () => {
    expect((await postAuth('google', {})).status).toBe(422);
  });

  it('503 when the JWT secret or the client id is not configured', async () => {
    stubGoogleKeys();
    const body = { id_token: await googleToken() };
    expect((await postAuth('google', body, { env: makeEnv({ AUTH_JWT_SECRET: '' }) })).status).toBe(503);
    expect((await postAuth('google', body, { env: makeEnv({ GOOGLE_WEB_CLIENT_ID: '' }) })).status).toBe(503);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates: new tokens, old refresh token dead, same family', async () => {
    const a = await signIn();
    const res = await refresh(a.refresh_token);
    expect(res.status).toBe(200);
    const b = await res.json<Session>();
    expect(b.refresh_token).not.toBe(a.refresh_token);
    expect(b.user).toEqual(a.user);
    const sidA = decodeJwt(a.access_token)['sid'];
    const sidB = decodeJwt(b.access_token)['sid'];
    expect(sidB).not.toBe(sidA);

    const sessions = await rowsOf<{ id: string; family_id: string; revoked_at: string | null; replaced_by: string | null }>('auth_sessions');
    expect(new Set(sessions.map((r) => r.family_id)).size).toBe(1);
    const old = sessions.find((r) => r.id === sidA);
    expect(old?.revoked_at).not.toBeNull();
    expect(old?.replaced_by).toBe(sidB);

    expect((await refresh(b.refresh_token)).status).toBe(200); // the chain continues
  });

  it('unknown token: 401', async () => {
    const res = await refresh('does-not-exist');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Invalid refresh token.' });
  });

  it('expired refresh token: 401', async () => {
    const a = await signIn();
    await testDb().prepare("UPDATE auth_sessions SET expires_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await refresh(a.refresh_token)).status).toBe(401);
  });

  it('two concurrent refreshes of one token: both succeed (the second is a grace replay) in one family', async () => {
    const a = await signIn();
    const [r1, r2] = await Promise.all([refresh(a.refresh_token), refresh(a.refresh_token)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const [s1, s2] = [await r1.json<Session>(), await r2.json<Session>()];
    expect(s1.refresh_token).not.toBe(s2.refresh_token);
    const live = await rowsOf<{ family_id: string }>('auth_sessions', 'revoked_at IS NULL');
    expect(live).toHaveLength(2);
    expect(new Set((await rowsOf<{ family_id: string }>('auth_sessions')).map((r) => r.family_id)).size).toBe(1);
    // Both chains keep working.
    expect((await refresh(s1.refresh_token)).status).toBe(200);
    expect((await refresh(s2.refresh_token)).status).toBe(200);
  });

  it('replaying a just-rotated token (lost response / double-fire) mints a fresh session in the same family', async () => {
    const a = await signIn();
    const b = await (await refresh(a.refresh_token)).json<Session>();
    const replay = await refresh(a.refresh_token);
    expect(replay.status).toBe(200);
    const c = await replay.json<Session>();
    expect(c.refresh_token).not.toBe(b.refresh_token);
    expect(c.user).toEqual(a.user);
    expect(new Set((await rowsOf<{ family_id: string }>('auth_sessions')).map((r) => r.family_id)).size).toBe(1);
    expect((await refresh(b.refresh_token)).status).toBe(200);
    expect((await refresh(c.refresh_token)).status).toBe(200);
  });

  it('a grace replay after the family was signed out is 401', async () => {
    const a = await signIn();
    const b = await (await refresh(a.refresh_token)).json<Session>();
    await postAuth('sign-out', { scope: 'global' }, { token: b.access_token });
    expect((await refresh(a.refresh_token)).status).toBe(401);
    expect(await rowsOf('auth_sessions', 'revoked_at IS NULL')).toHaveLength(0);
  });

  it('reuse detection: replaying an old rotated token revokes the whole family', async () => {
    const a = await signIn();
    const b = await (await refresh(a.refresh_token)).json<Session>();
    const c = await (await refresh(b.refresh_token)).json<Session>();
    await testDb().prepare(AGED).run(); // age the rotations beyond the grace window
    expect((await refresh(a.refresh_token)).status).toBe(401);
    expect(await rowsOf('auth_sessions', 'revoked_at IS NULL')).toHaveLength(0);
    expect((await refresh(c.refresh_token)).status).toBe(401);
  });

  it('reuse detection does not touch other families', async () => {
    const a = await signIn({ sub: 'g-a' });
    const other = await signIn({ sub: 'g-b' });
    await refresh(a.refresh_token);
    await testDb().prepare(AGED).run();
    await refresh(a.refresh_token);
    expect((await refresh(other.refresh_token)).status).toBe(200);
  });
});

describe('POST /auth/sign-out', () => {
  it('requires the access token', async () => {
    expect((await postAuth('sign-out', {})).status).toBe(401);
  });

  it('local with a refresh token revokes only that session', async () => {
    const a = await signIn({ sub: 'g-x' });
    const b = await signIn({ sub: 'g-x' }); // second device, same user
    const res = await postAuth('sign-out', { scope: 'local', refresh_token: a.refresh_token }, { token: a.access_token });
    expect(res.status).toBe(204);
    expect((await refresh(a.refresh_token)).status).toBe(401);
    expect((await refresh(b.refresh_token)).status).toBe(200);
  });

  it('local without a refresh token revokes the session of the access token', async () => {
    const a = await signIn({ sub: 'g-y' });
    const b = await signIn({ sub: 'g-y' });
    expect((await postAuth('sign-out', {}, { token: a.access_token })).status).toBe(204);
    expect((await refresh(a.refresh_token)).status).toBe(401);
    expect((await refresh(b.refresh_token)).status).toBe(200);
  });

  it('global revokes every session of the caller and nobody else', async () => {
    const a = await signIn({ sub: 'g-z' });
    const b = await signIn({ sub: 'g-z' });
    const other = await signIn({ sub: 'g-other', email: 'o@example.com' });
    expect((await postAuth('sign-out', { scope: 'global' }, { token: a.access_token })).status).toBe(204);
    expect((await refresh(a.refresh_token)).status).toBe(401);
    expect((await refresh(b.refresh_token)).status).toBe(401);
    expect((await refresh(other.refresh_token)).status).toBe(200);
  });

  it('cannot revoke a session of another user, even with their refresh token', async () => {
    const mine = await signIn({ sub: 'g-mine' });
    const theirs = await signIn({ sub: 'g-theirs', email: 't@example.com' });
    const res = await postAuth('sign-out', { scope: 'local', refresh_token: theirs.refresh_token }, { token: mine.access_token });
    expect(res.status).toBe(204);
    expect((await refresh(theirs.refresh_token)).status).toBe(200);
  });

  it('422 for an unknown scope', async () => {
    const a = await signIn();
    expect((await postAuth('sign-out', { scope: 'everything' }, { token: a.access_token })).status).toBe(422);
  });

  it('access tokens are stateless: still valid after sign-out until they expire', async () => {
    const a = await signIn();
    await postAuth('sign-out', { scope: 'global' }, { token: a.access_token });
    expect((await call('/api/v1/me', { token: a.access_token })).status).toBe(200);
  });
});
