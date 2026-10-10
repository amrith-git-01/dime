import { describe, expect, it } from 'vitest';

import { signUnsubscribeToken } from '../src/features/email/tokens';
import { USER_ID, call, makeEnv, testApp } from './helpers';

const NO_STORE = 'private, no-store';

function expectNoStore(res: Response): void {
  expect(res.headers.get('Cache-Control')).toBe(NO_STORE);
  expect(res.headers.get('Vary')).toContain('Authorization');
}

describe('API cache headers', () => {
  it('marks successful responses private and uncacheable', async () => {
    expectNoStore(await call('/api/v1/health', { token: false }));
  });

  it.each([
    ['401 (missing token)', '/api/v1/me', { token: false as const }, 401],
    ['404 (unknown route)', '/api/v1/nope', { token: false as const }, 404],
    ['422 (validation)', '/api/v1/email/unsubscribe', { token: false as const }, 422],
    ['401 (cron secret)', '/api/v1/internal/email/run', { token: false as const, method: 'POST', json: { kind: 'weekly' } }, 401],
  ])('marks %s responses too', async (_name, path, opts, status) => {
    const res = await call(path, opts);
    expect(res.status).toBe(status);
    expectNoStore(res);
  });

  it('marks 500 responses too', async () => {
    const app = testApp();
    app.get('/api/v1/__t/boom', () => {
      throw new Error('internal detail');
    });
    const res = await app.request('/api/v1/__t/boom', undefined, makeEnv());
    expect(res.status).toBe(500);
    expectNoStore(res);
  });

  it('covers the unsubscribe page', async () => {
    const secret = 'unsub-secret-for-tests';
    const token = await signUnsubscribeToken({ secret, userId: USER_ID, kind: 'weekly' });
    const env = makeEnv({ EMAIL_UNSUBSCRIBE_SECRET: secret });
    const res = await call(`/api/v1/email/unsubscribe?${new URLSearchParams({ token }).toString()}`, { token: false, env });
    expect(res.status).toBe(200);
    expectNoStore(res);
  });

  it('keeps Vary values added by other middleware (CORS)', async () => {
    const env = makeEnv({ CORS_ORIGINS: 'https://app.example' });
    const res = await testApp().request('/api/v1/health', { headers: { Origin: 'https://app.example' } }, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
    expect(res.headers.get('Vary')).toMatch(/Origin/);
    expectNoStore(res);
  });

  it('does not touch non-API routes (static email images are served by the assets layer)', async () => {
    const res = await call('/', { token: false });
    expect(res.headers.get('Cache-Control')).toBeNull();
  });
});
