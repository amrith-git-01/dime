import { describe, expect, it } from 'vitest';

import { ifNoneMatchMatches } from '../src/core/etag';
import { USER_ID, call, makeEnv, signToken, testApp } from './helpers';
import { seedTransaction, seedUser } from './db';

const OTHER_USER = '33333333-3333-3333-3333-333333333333';
const LIST = '/api/v1/transactions';

describe('ETag / 304 for JSON GETs', () => {
  it('adds a weak ETag to a JSON GET and keeps it uncacheable', async () => {
    const res = await call('/api/v1/health', { token: false });
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^W\/"[A-Za-z0-9_-]+"$/);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toContain('Authorization');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('answers 304 with no body when If-None-Match matches, keeping the headers', async () => {
    const first = await call('/api/v1/health', { token: false });
    const etag = first.headers.get('ETag')!;
    const res = await call('/api/v1/health', { token: false, headers: { 'If-None-Match': etag } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
    expect(res.headers.get('ETag')).toBe(etag);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('Vary')).toContain('Authorization');
    expect(res.headers.get('X-Request-ID')).toBeTruthy();
    expect(res.headers.get('Content-Length')).toBeNull();
  });

  it('keeps CORS headers on a 304', async () => {
    const env = makeEnv({ CORS_ORIGINS: 'https://app.example' });
    const etag = (await testApp().request('/api/v1/health', undefined, env)).headers.get('ETag')!;
    const res = await testApp().request('/api/v1/health', { headers: { Origin: 'https://app.example', 'If-None-Match': etag } }, env);
    expect(res.status).toBe(304);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example');
  });

  it('answers 200 with a fresh body on a mismatch', async () => {
    const res = await call('/api/v1/health', { token: false, headers: { 'If-None-Match': 'W/"stale"' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('matches comma lists, "*" and strong/weak forms', async () => {
    const etag = (await call('/api/v1/health', { token: false })).headers.get('ETag')!;
    const strong = etag.slice(2);
    for (const header of [`W/"x", ${etag}`, '*', strong]) {
      expect((await call('/api/v1/health', { token: false, headers: { 'If-None-Match': header } })).status, header).toBe(304);
    }
    expect(ifNoneMatchMatches(undefined, etag)).toBe(false);
    expect(ifNoneMatchMatches('"other"', etag)).toBe(false);
  });

  it('changes the tag when the data changes and differs between users', async () => {
    await seedUser(OTHER_USER);
    await seedTransaction({ amount: '10.00', type: 'debit', counterparty_name: 'Mine', counterparty_normalized: 'mine' });
    const mine = await call(LIST);
    const myTag = mine.headers.get('ETag')!;
    const otherToken = await signToken({ sub: OTHER_USER });
    const theirs = await call(LIST, { token: otherToken });
    expect(theirs.headers.get('ETag')).not.toBe(myTag);
    // The other user presenting my tag still gets a full 200 (their body differs).
    expect((await call(LIST, { token: otherToken, headers: { 'If-None-Match': myTag } })).status).toBe(200);
    expect((await call(LIST, { headers: { 'If-None-Match': myTag } })).status).toBe(304);

    await seedTransaction({ amount: '20.00', type: 'debit', counterparty_name: 'Mine two', counterparty_normalized: 'mine two', user_id: USER_ID });
    const changed = await call(LIST, { headers: { 'If-None-Match': myTag } });
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).not.toBe(myTag);
  });

  it('leaves writes, errors and responses with their own cache policy alone', async () => {
    const post = await call('/api/v1/feedback', { method: 'POST', json: {} });
    expect(post.headers.get('ETag')).toBeNull();

    const unauth = await call('/api/v1/me', { token: false, headers: { 'If-None-Match': '*' } });
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('ETag')).toBeNull();
    expect(unauth.headers.get('Cache-Control')).toBe('private, no-store');

    const app = testApp();
    app.get('/api/v1/__t/stream', (c) => c.body('data: x\n\n', 200, { 'Content-Type': 'text/event-stream' }));
    app.get('/api/v1/__t/own', (c) => c.json({ a: 1 }, 200, { 'Cache-Control': 'public, max-age=60' }));
    const stream = await app.request('/api/v1/__t/stream', undefined, makeEnv());
    expect(stream.headers.get('ETag')).toBeNull();
    expect(stream.headers.get('Cache-Control')).toBe('private, no-store');
    const own = await app.request('/api/v1/__t/own', { headers: { 'If-None-Match': '*' } }, makeEnv());
    expect(own.status).toBe(200);
    expect(own.headers.get('ETag')).toBeNull();
    expect(own.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('does not touch the unsubscribe HTML page', async () => {
    const res = await call('/api/v1/email/unsubscribe', { token: false });
    expect(res.headers.get('ETag')).toBeNull();
  });
});
