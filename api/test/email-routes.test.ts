import { describe, expect, it } from 'vitest';

import worker from '../src/index';
import type { Bindings } from '../src/core/env';
import { signUnsubscribeToken } from '../src/features/email/tokens';
import { FakeMessage, FakeQueue, fakeBatch } from './ingest-fixtures';
import { USER_ID, baseEnv, call, makeCtx, makeEnv } from './helpers';
import { oneRow, rowsOf, seedSettings, testDb } from './db';
import { useSupabaseStub } from './supabase-stub';

// Settings and jobs live in D1; the stub only guards that no outbound HTTP happens.
const stub = useSupabaseStub();

const SECRET = 'unsub-secret-for-tests';
const CRON_SECRET = 'cron-secret-for-tests';

function emailEnv(extra: Record<string, unknown> = {}, queue = new FakeQueue()) {
  const env = {
    ...makeEnv({
      EMAIL_UNSUBSCRIBE_SECRET: SECRET,
      EMAIL_CRON_SECRET: CRON_SECRET,
      BREVO_API_KEY: 'brevo-key',
      EMAIL_PUBLIC_BASE_URL: 'https://api.dime.test',
    }),
    EMAIL_QUEUE: queue.asQueue(),
    ...extra,
  } as unknown as Bindings;
  return { env, queue };
}

const settingsOf = () => oneRow<Record<string, number>>('user_settings', 'user_id = ?', USER_ID);

/** `n` users (user-0, user-1, ...) who have both digests switched on. */
async function seedOptedIn(n: number) {
  const db = testDb();
  for (let i = 0; i < n; i++) {
    await db.prepare('INSERT INTO users (id) VALUES (?)').bind(`user-${i}`).run();
    await db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').bind(`user-${i}`).run();
  }
}

describe('GET /api/v1/email/unsubscribe', () => {
  const unsubscribeUrl = (token: string) => `/api/v1/email/unsubscribe?${new URLSearchParams({ token }).toString()}`;

  it.each([
    ['weekly', 'Weekly letters are off.', { weekly_email_enabled: 0, monthly_email_enabled: 1 }],
    ['monthly', 'Monthly letters are off.', { weekly_email_enabled: 1, monthly_email_enabled: 0 }],
  ] as const)('a valid %s token switches that digest off and answers with the HTML page', async (kind, heading, flags) => {
    await seedSettings();
    const token = await signUnsubscribeToken({ secret: SECRET, userId: USER_ID, kind });
    const { env } = emailEnv();
    const res = await call(unsubscribeUrl(token), { token: false, env });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain(heading);
    expect(html).toContain('<!DOCTYPE html>');
    // Only the digest of the token's kind is touched.
    expect(await settingsOf()).toMatchObject(flags);
  });

  it('creates the settings row (digest off, everything else default) for a user who has none yet', async () => {
    const token = await signUnsubscribeToken({ secret: SECRET, userId: USER_ID, kind: 'weekly' });
    expect((await call(unsubscribeUrl(token), { token: false, env: emailEnv().env })).status).toBe(200);
    expect(await settingsOf()).toMatchObject({ weekly_email_enabled: 0, monthly_email_enabled: 1, budget_monthly_warn_pct: 80 });
  });

  it('works without authentication and without a body (it is a link in an email)', async () => {
    await seedSettings();
    const token = await signUnsubscribeToken({ secret: SECRET, userId: USER_ID, kind: 'weekly' });
    const res = await call(unsubscribeUrl(token), { token: false, env: emailEnv().env });
    expect(res.status).toBe(200);
  });

  it('400 for a bad signature, a tampered user, an expired token or garbage (no database write)', async () => {
    const good = await signUnsubscribeToken({ secret: SECRET, userId: USER_ID, kind: 'weekly' });
    const other = await signUnsubscribeToken({ secret: 'other-secret', userId: USER_ID, kind: 'weekly' });
    const old = await signUnsubscribeToken({ secret: SECRET, userId: USER_ID, kind: 'weekly', nowTs: Math.floor(Date.now() / 1000) - 91 * 86400 });
    const { env } = emailEnv();
    for (const token of [other, good.replace(USER_ID, '22222222-2222-2222-2222-222222222222'), old, 'not-a-token-at-all']) {
      const res = await call(unsubscribeUrl(token), { token: false, env });
      expect(res.status, token).toBe(400);
      expect(await res.json()).toEqual({ detail: 'Invalid unsubscribe link.' });
    }
    expect(stub.calls).toHaveLength(0);
    expect(await rowsOf('user_settings')).toHaveLength(0);
  });

  it('400 when the unsubscribe secret is not configured (no fallback key, S3)', async () => {
    const legacy = await signUnsubscribeToken({ secret: 'dev-unsub-secret', userId: USER_ID, kind: 'weekly' });
    const { env } = emailEnv({ EMAIL_UNSUBSCRIBE_SECRET: undefined });
    const res = await call(unsubscribeUrl(legacy), { token: false, env });
    expect(res.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
    expect(await rowsOf('user_settings')).toHaveLength(0);
  });

  it('422 for a missing or too-short token (FastAPI shape)', async () => {
    const { env } = emailEnv();
    const missing = await call('/api/v1/email/unsubscribe', { token: false, env });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ detail: [{ type: 'missing', loc: ['query', 'token'], msg: 'Field required' }] });
    const short = await call('/api/v1/email/unsubscribe?token=abc', { token: false, env });
    expect(short.status).toBe(422);
    expect(await short.json()).toEqual({ detail: [{ type: 'string_too_short', loc: ['query', 'token'], msg: 'String should have at least 8 characters' }] });
  });
});

describe('POST /api/v1/internal/email/run', () => {
  const run = (body: unknown, headers: Record<string, string> = {}, env = emailEnv().env) =>
    call('/api/v1/internal/email/run', { method: 'POST', json: body, token: false, headers, env });

  it('rejects a missing or wrong secret and never reads the database', async () => {
    expect((await run({ kind: 'weekly' })).status).toBe(401);
    expect((await run({ kind: 'weekly' }, { 'X-Email-Cron-Secret': 'nope' })).status).toBe(401);
    expect((await run({ kind: 'weekly' }, { 'X-Email-Cron-Secret': `${CRON_SECRET}x` })).status).toBe(401);
    expect((await run({ kind: 'weekly' }, { 'X-Email-Cron-Secret': CRON_SECRET.slice(0, -1) })).status).toBe(401);
    expect(await (await run({ kind: 'weekly' })).json()).toEqual({ detail: 'Unauthorized.' });
    expect(stub.calls).toHaveLength(0);
  });

  it.each([undefined, ''])('rejects everything when the configured secret is %j', async (configured) => {
    const { env } = emailEnv({ EMAIL_CRON_SECRET: configured });
    expect((await run({ kind: 'weekly' }, { 'X-Email-Cron-Secret': '' }, env)).status).toBe(401);
    expect((await run({ kind: 'weekly' }, { 'X-Email-Cron-Secret': 'anything' }, env)).status).toBe(401);
    expect((await run({ kind: 'weekly' }, {}, env)).status).toBe(401);
  });

  it('with the secret, enqueues the same messages the cron produces', async () => {
    await seedOptedIn(3);
    const { env, queue } = emailEnv();
    const res = await run({ kind: 'weekly' }, { 'x-email-cron-secret': CRON_SECRET }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 3, queued: 3 });
    expect(queue.sent).toHaveLength(3);
    expect(queue.sent[0]).toMatchObject({ type: 'digest', user_id: 'user-0', kind: 'weekly' });
    expect((queue.sent[0] as { period_key: string }).period_key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('monthly kind; invalid kind is 422 once authorized', async () => {
    await seedOptedIn(1);
    const { env, queue } = emailEnv();
    expect((await run({ kind: 'monthly' }, { 'X-Email-Cron-Secret': CRON_SECRET }, env)).status).toBe(200);
    expect((queue.sent[0] as { period_key: string }).period_key).toMatch(/^\d{4}-\d{2}$/);
    const bad = await run({ kind: 'daily' }, { 'X-Email-Cron-Secret': CRON_SECRET }, env);
    expect(bad.status).toBe(422);
    // An unauthorized caller learns nothing about the body schema.
    expect((await run({ kind: 'daily' }, {}, env)).status).toBe(401);
  });

  it('queues nothing when email is not configured (Brevo key missing)', async () => {
    const { env, queue } = emailEnv({ BREVO_API_KEY: undefined });
    const res = await run({ kind: 'weekly' }, { 'X-Email-Cron-Secret': CRON_SECRET }, env);
    expect(await res.json()).toEqual({ sent: 0, queued: 0 });
    expect(queue.sent).toHaveLength(0);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('static email assets', () => {
  it('serves the postcards from the Workers Static Assets binding at /email/*', async () => {
    for (let n = 1; n <= 5; n++) {
      const res = await baseEnv.ASSETS.fetch(`https://example.com/email/slide-${n}.png`);
      expect(res.status, `slide-${n}`).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]); // PNG magic
    }
  });

  it('the old /static/email path redirects so already-sent emails keep working', async () => {
    const res = await call('/static/email/slide-3.png', { token: false });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/email/slide-3.png');
    expect((await call('/static/email/', { token: false })).headers.get('location')).toBe('/email/');
  });
});

describe('worker entry points', () => {
  const MONDAY = Date.parse('2026-08-17T02:30:00Z');
  const MONDAY_THE_FIRST = Date.parse('2026-06-01T02:30:00Z');
  const TUESDAY = Date.parse('2026-08-18T02:30:00Z');
  const scheduled = (scheduledTime: number, env: Bindings, cron = '30 2 * * *') =>
    worker.scheduled({ cron, scheduledTime, type: 'scheduled', noRetry: () => undefined } as ScheduledController, env, makeCtx().ctx);

  it('the 08:00 IST cron fans out the weekly digest on Monday', async () => {
    await seedOptedIn(2);
    await testDb().prepare("UPDATE user_settings SET weekly_email_enabled = 0 WHERE user_id = 'user-1'").run();
    const { env, queue } = emailEnv();
    await scheduled(MONDAY, env);
    expect(queue.sent.map((m) => (m as { kind: string; user_id: string }).user_id)).toEqual(['user-0']);
    expect((queue.sent[0] as { period_key: string }).period_key).toBe('2026-W33');
  });

  it('weekly and monthly both run when Monday is the 1st', async () => {
    await seedOptedIn(1);
    const { env, queue } = emailEnv();
    await scheduled(MONDAY_THE_FIRST, env);
    expect(queue.sent).toEqual([
      { type: 'digest', user_id: 'user-0', kind: 'weekly', period_key: '2026-W22' },
      { type: 'digest', user_id: 'user-0', kind: 'monthly', period_key: '2026-05' },
    ]);
  });

  it('does nothing on other days (not even a database read)', async () => {
    const { env, queue } = emailEnv();
    await scheduled(TUESDAY, env);
    expect(queue.sent).toHaveLength(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('the ingest sweep cron is unaffected by the digest cron', async () => {
    const { env, queue } = emailEnv();
    await seedOptedIn(1);
    await expect(scheduled(MONDAY, env, '*/5 * * * *')).resolves.toBeUndefined();
    expect(queue.sent).toHaveLength(0);
  });

  it.each(['dime-email'])('routes the %s queue to the email consumer', async (queueName) => {
    const { env } = emailEnv();
    const bad = new FakeMessage({ nonsense: true });
    await worker.queue(fakeBatch(queueName, [bad]), env, makeCtx().ctx);
    expect(bad.acked).toBe(true); // malformed message: acked by the email consumer (not the ingest one)
    expect(bad.retried).toBeUndefined();
  });

  it.each(['dime-email-dlq'])('the %s DLQ logs and acks (valid or malformed), touching no service', async (queueName) => {
    const { env } = emailEnv();
    const dead = new FakeMessage({ type: 'digest', user_id: 'u-1', kind: 'weekly', period_key: '2026-W40' }, 4);
    const bad = new FakeMessage({ nonsense: true });
    const batch = fakeBatch(queueName, [dead, bad]);
    await worker.queue(batch, env, makeCtx().ctx);
    await worker.queue(batch, env, makeCtx().ctx); // redelivery is harmless
    expect(dead.acked && bad.acked).toBe(true);
    expect(dead.retried).toBeUndefined();
    expect(bad.retried).toBeUndefined();
    expect(stub.calls).toHaveLength(0);
  });

  it('acks messages of an unknown queue instead of retrying them forever', async () => {
    const { env } = emailEnv();
    const m = new FakeMessage({});
    await worker.queue(fakeBatch('something-else', [m]), env, makeCtx().ctx);
    expect(m.acked).toBe(true);
  });
});
