import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import worker from '../src/index';
import { currentUser, requireAuth } from '../src/core/auth';
import { limitBody } from '../src/core/body-limit';
import { getConfig } from '../src/core/env';
import { ConflictError, NotFoundError } from '../src/core/errors';
import { fetchJson } from '../src/core/http';
import { rateLimit } from '../src/core/rate-limit';
import { validate } from '../src/core/validation';
import { baseEnv, makeEnv, signToken, testApp } from './helpers';

function appWithTestRoutes() {
  const app = testApp();
  app.get('/__t/boom', () => {
    throw new Error('secret internal detail');
  });
  app.get('/__t/conflict', () => {
    throw new ConflictError('Already exists.');
  });
  app.get('/__t/missing', () => {
    throw new NotFoundError('Transaction not found.');
  });
  app.post('/__t/limited', limitBody(16), (c) => c.json({ ok: true }));
  app.post('/__t/validated', validate('json', z.object({ amount: z.string(), note: z.string().optional() })), (c) =>
    c.json(c.req.valid('json')),
  );
  app.get('/__t/me', requireAuth, (c) => c.json(currentUser(c)));
  app.get('/__t/limited-rate', requireAuth, rateLimit('WRITE_LIMITER'), (c) => c.json({ ok: true }));
  return app;
}

const get = (app: ReturnType<typeof testApp>, path: string, init?: RequestInit, env = baseEnv) =>
  app.request(path, init, env);

describe('health and root', () => {
  it('GET /api/v1/health matches the Python response', async () => {
    const res = await get(testApp(), '/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET / matches the Python response', async () => {
    const res = await get(testApp(), '/');
    expect(await res.json()).toEqual({ message: 'Dime API', docs: '/docs', openapi: '/openapi.json' });
  });

  it('is reachable through the Worker entrypoint', async () => {
    const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as unknown as ExecutionContext;
    const res = await worker.fetch(new Request('https://example.com/api/v1/health'), baseEnv, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-ID')).toBeTruthy();
  });
});

describe('request id', () => {
  it('generates an id when none is sent', async () => {
    const res = await get(testApp(), '/api/v1/health');
    expect(res.headers.get('X-Request-ID')).toMatch(/^[a-f0-9]{32}$/);
  });

  it('echoes a safe incoming id', async () => {
    const res = await get(testApp(), '/api/v1/health', { headers: { 'X-Request-ID': 'client-req-12345' } });
    expect(res.headers.get('X-Request-ID')).toBe('client-req-12345');
  });

  it('replaces an unsafe incoming id', async () => {
    const res = await get(testApp(), '/api/v1/health', { headers: { 'X-Request-ID': 'bad id!' } });
    expect(res.headers.get('X-Request-ID')).not.toBe('bad id!');
    expect(res.headers.get('X-Request-ID')).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe('error handling (C8)', () => {
  it('maps unknown errors to 500 with request_id and no internals', async () => {
    const res = await get(appWithTestRoutes(), '/__t/boom', { headers: { 'X-Request-ID': 'req-id-for-test' } });
    expect(res.status).toBe(500);
    expect(res.headers.get('X-Request-ID')).toBe('req-id-for-test');
    const body = await res.json();
    expect(body).toEqual({ detail: 'Internal error', request_id: 'req-id-for-test' });
  });

  it('maps AppError subclasses to their status with {detail}', async () => {
    const app = appWithTestRoutes();
    const conflict = await get(app, '/__t/conflict');
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ detail: 'Already exists.' });
    const missing = await get(app, '/__t/missing');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ detail: 'Transaction not found.' });
    expect(missing.headers.get('X-Request-ID')).toBeTruthy();
  });

  it('returns {"detail":"Not Found"} for unknown routes', async () => {
    const res = await get(testApp(), '/api/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Not Found' });
    expect(res.headers.get('X-Request-ID')).toBeTruthy();
  });

  it('returns a FastAPI-style 422 list for body validation errors', async () => {
    const app = appWithTestRoutes();
    const res = await get(app, '/__t/validated', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 5 }),
    });
    expect(res.status).toBe(422);
    const body = await res.json<{ detail: { type: string; loc: unknown[]; msg: string }[] }>();
    expect(Array.isArray(body.detail)).toBe(true);
    expect(body.detail).toContainEqual({ type: 'missing', loc: ['body', 'amount'], msg: 'Field required' });
    expect(body.detail.some((d) => d.loc.join('.') === 'body.note')).toBe(true);
  });

  it('returns 422 for malformed JSON', async () => {
    const res = await get(appWithTestRoutes(), '/__t/validated', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ detail: [{ type: 'json_invalid', loc: ['body'] }] });
  });

  it('accepts a valid body', async () => {
    const res = await get(appWithTestRoutes(), '/__t/validated', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '12.50' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: '12.50' });
  });
});

describe('auth middleware', () => {
  const me = (token?: string, scheme = 'Bearer') =>
    get(appWithTestRoutes(), '/__t/me', token ? { headers: { Authorization: `${scheme} ${token}` } } : undefined);

  it('accepts a valid HS256 token and sets the user', async () => {
    const token = await signToken({ sub: 'user-abc', email: 'a@example.com' });
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'user-abc', email: 'a@example.com', accessToken: token });
  });

  it('is case-insensitive about the Bearer scheme', async () => {
    const res = await me(await signToken(), 'bearer');
    expect(res.status).toBe(200);
  });

  it('rejects a missing header with 401 and WWW-Authenticate', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    expect(await res.json()).toEqual({ detail: 'Not authenticated.' });
  });

  it('rejects a non-Bearer scheme', async () => {
    const res = await me(await signToken(), 'Basic');
    expect(res.status).toBe(401);
  });

  it('rejects garbage tokens', async () => {
    const res = await me('not-a-jwt');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Invalid or expired token.' });
  });

  it('rejects a token signed with the wrong secret', async () => {
    const res = await me(await signToken({ secret: 'another-secret-another-secret-another' }));
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const res = await me(await signToken({ expiresIn: Math.floor(Date.now() / 1000) - 120 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Invalid or expired token.' });
  });

  it('rejects the wrong audience', async () => {
    const res = await me(await signToken({ aud: 'anon' }));
    expect(res.status).toBe(401);
  });

  it('rejects the wrong issuer', async () => {
    const res = await me(await signToken({ iss: 'https://evil.example.com/auth/v1' }));
    expect(res.status).toBe(401);
  });

  it('rejects a token without a subject', async () => {
    const res = await me(await signToken({ sub: null }));
    expect(res.status).toBe(401);
  });

  it('rejects unsupported algorithms', async () => {
    const res = await me(await signToken({ alg: 'HS512' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ detail: 'Unsupported token signing algorithm.' });
  });

  it('returns 503 for HS256 tokens when no secret is configured', async () => {
    const token = await signToken();
    const res = await get(
      appWithTestRoutes(),
      '/__t/me',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv({ SUPABASE_JWT_SECRET: '' }),
    );
    expect(res.status).toBe(503);
  });
});

describe('body limit', () => {
  it('returns 413 when Content-Length exceeds the cap', async () => {
    const res = await get(appWithTestRoutes(), '/__t/limited', { method: 'POST', body: 'x'.repeat(64) });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ detail: 'Request body too large.' });
  });

  it('passes bodies under the cap', async () => {
    const res = await get(appWithTestRoutes(), '/__t/limited', { method: 'POST', body: 'tiny' });
    expect(res.status).toBe(200);
  });
});

describe('CORS', () => {
  it('adds no CORS headers by default', async () => {
    const res = await get(testApp(), '/api/v1/health', { headers: { Origin: 'https://web.example.com' } });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers preflight only for configured origins, without credentials', async () => {
    const env = makeEnv({ CORS_ORIGINS: 'https://web.example.com' });
    const res = await get(
      testApp(),
      '/api/v1/health',
      { method: 'OPTIONS', headers: { Origin: 'https://web.example.com', 'Access-Control-Request-Method': 'GET' } },
      env,
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://web.example.com');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    expect(res.headers.get('X-Request-ID')).toBeTruthy();
  });
});

describe('rate limit', () => {
  it('is a no-op without a binding and 429s when the limiter rejects', async () => {
    const token = await signToken();
    const headers = { Authorization: `Bearer ${token}` };
    const ok = await get(appWithTestRoutes(), '/__t/limited-rate', { headers }, makeEnv({ WRITE_LIMITER: undefined }));
    expect(ok.status).toBe(200);

    const denied = makeEnv();
    (denied as unknown as Record<string, unknown>).WRITE_LIMITER = { limit: () => Promise.resolve({ success: false }) };
    const res = await get(appWithTestRoutes(), '/__t/limited-rate', { headers }, denied);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ detail: 'Too many requests' });
  });
});

describe('config', () => {
  it('applies Python-mirroring defaults', () => {
    const cfg = getConfig(makeEnv({ CORS_ORIGINS: '', MAX_RECEIPT_UPLOAD_BYTES: undefined, SIGNED_URL_TTL_SECONDS: undefined }));
    expect(cfg.corsOrigins).toEqual([]);
    expect(cfg.maxReceiptUploadBytes).toBe(10 * 1024 * 1024);
    expect(cfg.maxVoiceUploadBytes).toBe(15 * 1024 * 1024);
    expect(cfg.signedUrlTtlSeconds).toBe(6 * 60 * 60);
    expect(cfg.avatarUrlAllowedHosts).toEqual(['api.dicebear.com']);
    expect(cfg.agent.thinkingEnabled).toBe(false);
    expect(cfg.agent.strictTools).toBe(true);
  });

  it('fails clearly when SUPABASE_URL is invalid', () => {
    expect(() => getConfig(makeEnv({ SUPABASE_URL: 'nope' }))).toThrow(/SUPABASE_URL/);
  });
});

describe('fetchJson', () => {
  it('maps a network-level failure to an UpstreamError', async () => {
    await expect(
      fetchJson('http://127.0.0.1:1/unreachable', { timeoutMs: 500, retries: 0, upstream: 'test' }),
    ).rejects.toMatchObject({ status: expect.any(Number) as number });
  });
});
