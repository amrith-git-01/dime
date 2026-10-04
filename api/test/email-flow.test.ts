import { describe, expect, it } from 'vitest';

import { createServiceClient } from '../src/core/supabase';
import { PermanentEmailError } from '../src/features/email/brevo';
import { processEmailMessage, retryDelaySeconds } from '../src/features/email/consumer';
import { SEND_BATCH_LIMIT, fanOutDigest } from '../src/features/email/digest';
import { buildDigestPayload } from '../src/features/email/digest-payload';
import { digestPeriodFromKey } from '../src/features/email/periods';
import {
  PENDING_RECLAIM_AFTER_MS,
  deletePending,
  fetchUserEmail,
  listDigestUserPages,
  markSent,
  tryBegin,
} from '../src/features/email/sends-repository';
import { assetBase, createEmailDeps, displayName, sendDigest, sendWelcome } from '../src/features/email/service';
import type { EmailDeps } from '../src/features/email/service';
import { FakeMessage, FakeQueue } from './ingest-fixtures';
import { USER_ID, makeEnv } from './helpers';
import { json, pgError, rows, useSupabaseStub } from './supabase-stub';
import type { RecordedCall } from './supabase-stub';

const stub = useSupabaseStub();

const NOW = Date.parse('2026-08-17T02:30:00Z');
const EMAIL_ENV = {
  BREVO_API_KEY: 'brevo-key',
  EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret',
  EMAIL_FROM: 'Dime <hello@dime.test>',
  EMAIL_PUBLIC_BASE_URL: 'https://api.dime.test',
  EMAIL_APP_LINK: 'https://app.dime.test/open',
};

function deps(overrides: Record<string, string | undefined> = {}): EmailDeps {
  const env = makeEnv({ ...EMAIL_ENV, ...overrides });
  return createEmailDeps(env, createServiceClient(env));
}

const SENDS = '/rest/v1/email_sends';
const KEY = { userId: USER_ID, kind: 'weekly', periodKey: '2026-W33' } as const;

const noContent = () => new Response(null, { status: 204 });
const brevoOk = () => json({ messageId: '<m1@brevo>' }, { status: 201 });

/** Scripts the whole happy path of one digest email for USER_ID. */
function stubDigestWorld(opts: { email?: string | null; brevo?: () => Response; claim?: () => Response } = {}) {
  stub.on('GET', '/rest/v1/users', () => rows([{ email: opts.email === undefined ? 'amrith@example.com' : opts.email, username: 'Amrith' }]));
  stub.on('POST', SENDS, opts.claim ?? (() => json([], { status: 201 })));
  stub.on('PATCH', SENDS, () => noContent());
  stub.on('DELETE', SENDS, () => noContent());
  stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () => json({ credit_total: 2000, debit_total: 500, transaction_count: 3, debit_by_category: {} }));
  stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => json([]));
  stub.on('GET', '/rest/v1/transactions', () => rows([]));
  stub.on('GET', '/rest/v1/budgets', () => rows([]));
  stub.on('POST', '/v3/smtp/email', opts.brevo ?? brevoOk);
}

describe('email_sends claim / reclaim (port of B3 tests)', () => {
  it('inserts a pending row with claimed_at', async () => {
    stub.on('POST', SENDS, () => json([], { status: 201 }));
    expect(await tryBegin(createServiceClient(makeEnv()), KEY, NOW)).toBe(true);
    expect(stub.last('POST', SENDS).body).toEqual({
      user_id: USER_ID,
      kind: 'weekly',
      period_key: '2026-W33',
      status: 'pending',
      claimed_at: '2026-08-17T02:30:00.000Z',
    });
  });

  it('a non-unique error propagates instead of looking "already claimed", and nothing is reclaimed', async () => {
    stub.on('POST', SENDS, () => pgError('08006', 'connection lost', 500));
    await expect(tryBegin(createServiceClient(makeEnv()), KEY, NOW)).rejects.toMatchObject({ code: '08006' });
    expect(stub.find('PATCH', SENDS)).toHaveLength(0);
  });

  it('a network error propagates', async () => {
    stub.on('POST', SENDS, () => Promise.reject(new TypeError('fetch failed')));
    await expect(tryBegin(createServiceClient(makeEnv()), KEY, NOW)).rejects.toBeDefined();
    expect(stub.find('PATCH', SENDS)).toHaveLength(0);
  });

  it.each([
    ['Postgres 23505', () => pgError('23505', 'duplicate key value violates unique constraint', 409)],
    ['PostgREST 409', () => pgError('409', 'conflict', 409)],
  ])('%s with a fresh pending row stays claimed', async (_name, conflict) => {
    stub.on('POST', SENDS, conflict);
    stub.on('PATCH', SENDS, () => rows([]));
    expect(await tryBegin(createServiceClient(makeEnv()), KEY, NOW)).toBe(false);
  });

  it('reclaims a pending row older than 30 minutes (conditional update, pending rows only)', async () => {
    stub.on('POST', SENDS, () => pgError('23505', 'dup', 409));
    stub.on('PATCH', SENDS, () => rows([{ id: 'x' }]));
    expect(await tryBegin(createServiceClient(makeEnv()), { ...KEY, kind: 'monthly', periodKey: '2026-09' }, NOW)).toBe(true);

    const patch = stub.last('PATCH', SENDS);
    expect(patch.params.get('status')).toBe('eq.pending');
    expect(patch.params.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(patch.params.get('kind')).toBe('eq.monthly');
    expect(patch.params.get('period_key')).toBe('eq.2026-09');
    expect(patch.params.get('claimed_at')).toBe(`lt.${new Date(NOW - PENDING_RECLAIM_AFTER_MS).toISOString()}`);
    expect(patch.body).toEqual({ claimed_at: '2026-08-17T02:30:00.000Z' });
    expect(PENDING_RECLAIM_AFTER_MS).toBe(30 * 60 * 1000);
  });

  it('markSent and deletePending are scoped to the key; delete only touches pending rows', async () => {
    stub.on('PATCH', SENDS, () => noContent());
    stub.on('DELETE', SENDS, () => noContent());
    const db = createServiceClient(makeEnv());
    await markSent(db, KEY, '<id>');
    expect(stub.last('PATCH', SENDS).body).toMatchObject({ status: 'sent', brevo_message_id: '<id>' });
    expect(stub.last('PATCH', SENDS).params.get('period_key')).toBe('eq.2026-W33');
    await deletePending(db, KEY);
    expect(stub.last('DELETE', SENDS).params.get('status')).toBe('eq.pending');
    expect(stub.last('DELETE', SENDS).params.get('user_id')).toBe(`eq.${USER_ID}`);
  });

  it('fetchUserEmail treats blank values as missing', async () => {
    stub.on('GET', '/rest/v1/users', () => rows([{ email: '  ', username: 'A' }]), { once: true });
    expect(await fetchUserEmail(createServiceClient(makeEnv()), USER_ID)).toEqual({ email: null, username: 'A' });
    stub.on('GET', '/rest/v1/users', () => rows([]));
    expect(await fetchUserEmail(createServiceClient(makeEnv()), USER_ID)).toEqual({ email: null, username: null });
  });
});

describe('welcome email', () => {
  const input = { userId: USER_ID, email: 'amrith@example.com', username: 'Amrith' };

  it('claims (welcome, once), sends through Brevo and marks sent', async () => {
    stub.on('POST', SENDS, () => json([], { status: 201 }));
    stub.on('PATCH', SENDS, () => noContent());
    stub.on('POST', '/v3/smtp/email', brevoOk);

    await sendWelcome(deps(), input);

    expect(stub.last('POST', SENDS).body).toMatchObject({ kind: 'welcome', period_key: 'once', status: 'pending', user_id: USER_ID });
    const mail = stub.last('POST', '/v3/smtp/email').body as { subject: string; htmlContent: string; to: unknown[]; headers: Record<string, string> };
    expect(mail.subject).toBe("You're in. This is Dime.");
    expect(mail.to).toEqual([{ email: 'amrith@example.com', name: 'Amrith' }]);
    // Postcards come from this Worker's static assets by default.
    expect(mail.htmlContent).toContain('https://api.dime.test/email/slide-1.png');
    expect(mail.htmlContent).toContain('https://app.dime.test/open');
    // The List-Unsubscribe header carries a signed weekly link on the Python path.
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/api\.dime\.test\/api\/v1\/email\/unsubscribe\?token=/);
    expect(decodeURIComponent(mail.headers['List-Unsubscribe'] ?? '')).toContain(`${USER_ID}|weekly|`);
    expect(stub.last('PATCH', SENDS).body).toMatchObject({ status: 'sent', brevo_message_id: '<m1@brevo>' });
    // Order: claim, send, mark.
    const order = stub.calls.map((c) => `${c.method} ${c.url.pathname}`);
    expect(order.indexOf('POST /rest/v1/email_sends')).toBeLessThan(order.indexOf('POST /v3/smtp/email'));
    expect(order.indexOf('POST /v3/smtp/email')).toBeLessThan(order.indexOf('PATCH /rest/v1/email_sends'));
  });

  it('uses EMAIL_ASSET_BASE_URL for the postcards when set', async () => {
    stub.on('POST', SENDS, () => json([], { status: 201 }));
    stub.on('PATCH', SENDS, () => noContent());
    stub.on('POST', '/v3/smtp/email', brevoOk);
    await sendWelcome(deps({ EMAIL_ASSET_BASE_URL: 'https://cdn.dime.test/mail/' }), input);
    expect((stub.last('POST', '/v3/smtp/email').body as { htmlContent: string }).htmlContent).toContain('https://cdn.dime.test/mail/slide-3.png');
  });

  it('is sent once: an existing claim means no email', async () => {
    stub.on('POST', SENDS, () => pgError('23505', 'dup', 409));
    stub.on('PATCH', SENDS, () => rows([]));
    await sendWelcome(deps(), input);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('skips without a Brevo key, and without the unsubscribe secret (S3)', async () => {
    await sendWelcome(deps({ BREVO_API_KEY: undefined }), input);
    await sendWelcome(deps({ EMAIL_UNSUBSCRIBE_SECRET: undefined }), input);
    await sendWelcome(deps(), { ...input, email: '   ' });
    expect(stub.calls).toHaveLength(0);
  });

  it('a failed send releases the claim and does not throw', async () => {
    stub.on('POST', SENDS, () => json([], { status: 201 }));
    stub.on('DELETE', SENDS, () => noContent());
    stub.on('POST', '/v3/smtp/email', () => json({ message: 'bad' }, { status: 500 }));
    await expect(sendWelcome(deps(), input)).resolves.toBeUndefined();
    expect(stub.find('DELETE', SENDS)).toHaveLength(1);
    expect(stub.last('DELETE', SENDS).params.get('kind')).toBe('eq.welcome');
    expect(stub.find('PATCH', SENDS)).toHaveLength(0);
  });

  it('a claim error (database down) propagates so the caller can log it', async () => {
    stub.on('POST', SENDS, () => pgError('08006', 'down', 500));
    await expect(sendWelcome(deps(), input)).rejects.toBeDefined();
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('display name falls back to the mailbox part', () => {
    expect(displayName(' Amrith ', 'a@b.c')).toBe('Amrith');
    expect(displayName(null, 'jo.doe@example.com')).toBe('jo.doe');
    expect(displayName('  ', '@x.com')).toBe('there');
  });

  it('asset base: override, else this Worker', () => {
    expect(assetBase(deps().config)).toBe('https://api.dime.test/email');
    expect(assetBase(deps({ EMAIL_ASSET_BASE_URL: 'https://cdn/x/' }).config)).toBe('https://cdn/x');
  });
});

describe('digest fan-out', () => {
  const users = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ user_id: `u${String(from + i).padStart(5, '0')}` }));

  it('queues one message per opted-in user in batches of at most 100', async () => {
    stub.on('GET', '/rest/v1/user_settings', (call) => rows(call.params.get('offset') === '1000' ? users(50, 1000) : users(1000)));
    const queue = new FakeQueue();
    const batches: number[] = [];
    const recording = {
      sendBatch: (msgs: Iterable<{ body: unknown }>) => {
        const list = [...msgs];
        batches.push(list.length);
        return queue.sendBatch(list);
      },
    };
    const env = makeEnv(EMAIL_ENV);
    const result = await fanOutDigest({ db: createServiceClient(env), queue: recording, config: deps().config, kind: 'weekly', nowMs: NOW });

    expect(result).toEqual({ kind: 'weekly', periodKey: '2026-W33', queued: 1050 });
    expect(batches).toEqual([...Array<number>(10).fill(100), 50]);
    expect(Math.max(...batches)).toBeLessThanOrEqual(SEND_BATCH_LIMIT);
    expect(queue.sent).toHaveLength(1050);
    expect(queue.sent[0]).toEqual({ type: 'digest', user_id: 'u00000', kind: 'weekly', period_key: '2026-W33' });
    expect(new Set(queue.sent.map((m) => (m as { user_id: string }).user_id)).size).toBe(1050);

    // Two pages of 1000 rows, filtered by the weekly flag, stable order.
    const pages = stub.find('GET', '/rest/v1/user_settings');
    expect(pages).toHaveLength(2);
    expect(pages[0]?.params.get('weekly_email_enabled')).toBe('eq.true');
    expect(pages[0]?.params.get('order')).toBe('user_id.asc');
    expect(pages[0]?.params.get('limit')).toBe('1000');
    expect(pages[0]?.params.get('offset')).toBe('0');
    expect(pages[1]?.params.get('offset')).toBe('1000');
  });

  it('monthly uses the monthly flag and the previous month key', async () => {
    stub.on('GET', '/rest/v1/user_settings', () => rows(users(3)));
    const queue = new FakeQueue();
    const env = makeEnv(EMAIL_ENV);
    const result = await fanOutDigest({ db: createServiceClient(env), queue, config: deps().config, kind: 'monthly', nowMs: Date.parse('2026-09-01T02:30:00Z') });
    expect(result).toMatchObject({ kind: 'monthly', periodKey: '2026-08', queued: 3 });
    expect(stub.last('GET', '/rest/v1/user_settings').params.get('monthly_email_enabled')).toBe('eq.true');
    expect(queue.sent[0]).toMatchObject({ kind: 'monthly', period_key: '2026-08' });
  });

  it('exactly one full page triggers a second (empty) page request', async () => {
    stub.on('GET', '/rest/v1/user_settings', (call) => rows(call.params.get('offset') === '0' ? users(1000) : []));
    const queue = new FakeQueue();
    const env = makeEnv(EMAIL_ENV);
    const result = await fanOutDigest({ db: createServiceClient(env), queue, config: deps().config, kind: 'weekly', nowMs: NOW });
    expect(result.queued).toBe(1000);
    expect(stub.find('GET', '/rest/v1/user_settings')).toHaveLength(2);
  });

  it('queues nothing when Brevo or the unsubscribe secret is missing (no database read either)', async () => {
    const queue = new FakeQueue();
    for (const missing of ['BREVO_API_KEY', 'EMAIL_UNSUBSCRIBE_SECRET']) {
      const env = makeEnv({ ...EMAIL_ENV, [missing]: undefined });
      const result = await fanOutDigest({ db: createServiceClient(env), queue, config: createEmailDeps(env, createServiceClient(env)).config, kind: 'weekly', nowMs: NOW });
      expect(result.queued).toBe(0);
    }
    expect(queue.sent).toHaveLength(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('a failing queue surfaces to the caller (cron logs it)', async () => {
    stub.on('GET', '/rest/v1/user_settings', () => rows(users(2)));
    const queue = new FakeQueue();
    queue.failWith = new Error('queue down');
    const env = makeEnv(EMAIL_ENV);
    await expect(fanOutDigest({ db: createServiceClient(env), queue, config: deps().config, kind: 'weekly', nowMs: NOW })).rejects.toThrow('queue down');
  });

  it('listDigestUserPages skips rows without a user id', async () => {
    stub.on('GET', '/rest/v1/user_settings', () => rows([{ user_id: 'a' }, { user_id: null }, { user_id: '' }]));
    const pages: string[][] = [];
    for await (const page of listDigestUserPages(createServiceClient(makeEnv()), 'weekly')) pages.push(page);
    expect(pages).toEqual([['a']]);
  });
});

describe('digest email for one user (consumer core)', () => {
  const period = digestPeriodFromKey('weekly', '2026-W33');

  it('claims, builds the payload from SQL aggregates, sends and marks sent', async () => {
    stubDigestWorld();
    expect(period).not.toBeNull();
    const outcome = await sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> });

    expect(outcome).toBe('sent');
    const mail = stub.last('POST', '/v3/smtp/email').body as { subject: string; htmlContent: string; to: unknown[]; headers: Record<string, string> };
    expect(mail.subject).toBe('Your week in Dime');
    expect(mail.to).toEqual([{ email: 'amrith@example.com', name: 'Amrith' }]);
    expect(mail.htmlContent).toContain('Here&#x27;s last week, Amrith.');
    expect(mail.htmlContent).toContain('10 Aug – 16 Aug 2026');
    expect(mail.htmlContent).toContain('₹500');
    expect(mail.htmlContent).toContain('₹2,000');
    expect(mail.htmlContent).toContain('No budget set');
    // weekly digests carry the weekly unsubscribe link
    expect(decodeURIComponent(mail.headers['List-Unsubscribe'] ?? '')).toContain(`${USER_ID}|weekly|`);
    expect(stub.last('POST', SENDS).body).toMatchObject({ kind: 'weekly', period_key: '2026-W33', status: 'pending' });
    expect(stub.last('PATCH', SENDS).body).toMatchObject({ status: 'sent', brevo_message_id: '<m1@brevo>' });
    // The period range reaches the RPCs as the half-open IST week.
    expect(stub.find('POST', '/rpc/transactions_period_summary')[0]?.body).toEqual({
      p_user_id: USER_ID,
      p_from: '2026-08-09T18:30:00.000Z',
      p_to: '2026-08-16T18:30:00.000Z',
    });
  });

  it('monthly digest: monthly subject and monthly unsubscribe link', async () => {
    stubDigestWorld();
    const monthly = digestPeriodFromKey('monthly', '2026-08');
    await sendDigest(deps(), { userId: USER_ID, period: monthly as NonNullable<typeof monthly> });
    const mail = stub.last('POST', '/v3/smtp/email').body as { subject: string; htmlContent: string; headers: Record<string, string> };
    expect(mail.subject).toBe('Your August in Dime');
    expect(mail.htmlContent).toContain('Here&#x27;s August, Amrith.');
    expect(decodeURIComponent(mail.headers['List-Unsubscribe'] ?? '')).toContain(`${USER_ID}|monthly|`);
  });

  it('skips a user without an address before claiming anything', async () => {
    stubDigestWorld({ email: null });
    expect(await sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> })).toBe('skipped');
    expect(stub.find('POST', SENDS)).toHaveLength(0);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('skips when another worker holds a fresh claim', async () => {
    stub.on('PATCH', SENDS, () => rows([]));
    stubDigestWorld({ claim: () => pgError('23505', 'dup', 409) });
    expect(await sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> })).toBe('skipped');
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('a Brevo failure releases the claim and rethrows', async () => {
    stubDigestWorld({ brevo: () => json({}, { status: 503 }) });
    await expect(sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> })).rejects.toBeDefined();
    expect(stub.find('DELETE', SENDS)).toHaveLength(1);
    expect(stub.find('PATCH', SENDS)).toHaveLength(0);
  });
});

describe('processEmailMessage (queue consumer)', () => {
  const body = { type: 'digest', user_id: USER_ID, kind: 'weekly', period_key: '2026-W33' };

  it('acks a sent email', async () => {
    stubDigestWorld();
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(1);
  });

  it('acks a duplicate delivery without sending again', async () => {
    stub.on('PATCH', SENDS, () => rows([]));
    stubDigestWorld({ claim: () => pgError('23505', 'dup', 409) });
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('transient failure: claim released, message retried with backoff', async () => {
    stubDigestWorld({ brevo: () => json({}, { status: 429 }) });
    const message = new FakeMessage(body, 2);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(false);
    expect(message.retried).toEqual({ delaySeconds: 60 });
    expect(stub.find('DELETE', SENDS)).toHaveLength(1);
  });

  it('a database hiccup before the claim is also retried', async () => {
    stub.on('GET', '/rest/v1/users', () => pgError('', 'fetch failed', 500));
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.retried).toEqual({ delaySeconds: 30 });
  });

  it('permanent failure (Brevo refuses): claim released, acked, never retried', async () => {
    stubDigestWorld({ brevo: () => json({ message: 'invalid address' }, { status: 400 }) });
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();
    expect(stub.find('DELETE', SENDS)).toHaveLength(1);
    expect(new PermanentEmailError('x').name).toBe('PermanentEmailError');
  });

  it('acks malformed bodies, unknown periods and unconfigured deployments without touching anything', async () => {
    for (const bad of [null, 'text', { type: 'digest' }, { ...body, kind: 'daily' }, { ...body, type: 'other' }]) {
      const m = new FakeMessage(bad);
      await processEmailMessage(m, deps());
      expect(m.acked, JSON.stringify(bad)).toBe(true);
    }
    const badPeriod = new FakeMessage({ ...body, period_key: '2026-13' });
    await processEmailMessage(badPeriod, deps());
    expect(badPeriod.acked).toBe(true);
    const unconfigured = new FakeMessage(body);
    await processEmailMessage(unconfigured, deps({ BREVO_API_KEY: undefined }));
    expect(unconfigured.acked).toBe(true);
    expect(stub.calls).toHaveLength(0);
  });

  it('backoff doubles from 30 s and caps at 10 minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 480, 600, 600]);
  });
});

describe('buildDigestPayload (SQL aggregates instead of row loops)', () => {
  const CAT_FOOD = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const CAT_GONE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const range = { from: '2026-08-09T18:30:00.000Z', to: '2026-08-16T18:30:00.000Z' };
  const monthSummaryFor = (call: RecordedCall) => (call.body as { p_from: string }).p_from === range.from;

  function stubWorld(opts: { monthly?: number | null } = {}) {
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', (call) =>
      monthSummaryFor(call)
        ? json({ credit_total: 2000, debit_total: 1000, transaction_count: 9, debit_by_category: { [CAT_FOOD]: 600, [CAT_GONE]: 150, '': 250 } })
        : json({ credit_total: 9000, debit_total: 8200, transaction_count: 40, debit_by_category: {} }),
    );
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () =>
      json([
        { type: 'debit', payee_key: 'metro', display_name: 'Metro', total: 400, transaction_count: 4 },
        { type: 'debit', payee_key: 'swiggy', display_name: 'Swiggy', total: 300, transaction_count: 3 },
        { type: 'debit', payee_key: 'a', display_name: 'A', total: 100, transaction_count: 1 },
        { type: 'debit', payee_key: 'b', display_name: 'B', total: 90, transaction_count: 1 },
        { type: 'debit', payee_key: 'c', display_name: 'C', total: 60, transaction_count: 1 },
        { type: 'debit', payee_key: 'd', display_name: 'D', total: 50, transaction_count: 1 },
        { type: 'credit', payee_key: 'boss', display_name: 'Boss', total: 2000, transaction_count: 1 },
      ]),
    );
    stub.on('GET', '/rest/v1/transactions', () =>
      rows([
        { id: 't1', amount: 400, type: 'debit', counterparty_name: ' Metro ', transaction_at: '2026-08-12T10:00:00+00:00', user_id: USER_ID },
        { id: 't2', amount: 300.5, type: 'debit', counterparty_name: null, transaction_at: '2026-08-10T20:00:00+00:00', user_id: USER_ID }, // 11 Aug 01:30 IST
      ]),
    );
    stub.on('GET', '/rest/v1/budgets', () => rows(opts.monthly === null ? [] : [{ id: 'b', user_id: USER_ID, monthly_budget: opts.monthly ?? 20000, daily_budget: 0 }]));
    stub.on('GET', '/rest/v1/categories', () => rows([{ id: CAT_FOOD, name: ' Food ', icon_name: 'x', color: '#000', is_system: true }]));
  }

  it('builds every card from RPC results', async () => {
    stubWorld();
    const payload = await buildDigestPayload(createServiceClient(makeEnv()), { userId: USER_ID, range, budgetYear: 2026, budgetMonth: 8, tz: 'Asia/Kolkata' });

    expect(payload).toMatchObject({ spent: '1000.00', income: '2000.00', net: '1000.00', empty: false });
    // Python quirk kept: the "Other" bucket is the 5th row of "who you paid" (top 4 + Other).
    expect(payload.payees.map((p) => p[0])).toEqual(['Metro', 'Swiggy', 'A', 'B', 'Other']);
    expect(payload.payees[0]).toEqual(['Metro', '400.00', 1]);
    expect(payload.payees[4]).toEqual(['Other', '110.00', 110 / 400]);
    expect(payload.incomeSources).toEqual([['Boss', '2000.00', 1]]);
    // Categories: all of them, sorted by amount; unknown ids count as custom; no category is "Uncategorized".
    expect(payload.categories).toEqual([
      ['Food', '600.00', 1, false],
      ['Uncategorized', '250.00', 250 / 600, false],
      ['Category', '150.00', 150 / 600, true],
    ]);
    expect(payload.topExpenses).toEqual([
      ['Metro', '12 Aug', '400.00'],
      ['Expense', '11 Aug', '300.50'],
    ]);
    expect(payload.budgetLine).toBe('₹11,800 / ₹20,000');
    expect(payload.budgetPct).toBeCloseTo(0.41);
    // Money stays in the database: one summary for the period, one for the budget month, one payee RPC, one top-5 query.
    expect(stub.find('POST', '/rpc/transactions_period_summary')).toHaveLength(2);
    expect(stub.find('POST', '/rpc/transactions_payee_totals')).toHaveLength(1);
    expect(stub.last('GET', '/rest/v1/transactions').params.get('limit')).toBe('5');
    expect(stub.last('GET', '/rest/v1/categories').params.get('id')).toContain(CAT_FOOD);
  });

  it('no budget: no budget-month query', async () => {
    stubWorld({ monthly: null });
    const payload = await buildDigestPayload(createServiceClient(makeEnv()), { userId: USER_ID, range, budgetYear: 2026, budgetMonth: 8, tz: 'Asia/Kolkata' });
    expect(payload.budgetLine).toBe('No budget set');
    expect(payload.budgetPct).toBeNull();
    expect(stub.find('POST', '/rpc/transactions_period_summary')).toHaveLength(1);
  });

  it('an empty period has no ranked rows and no categories lookup', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () => json({ credit_total: 0, debit_total: 0, transaction_count: 0, debit_by_category: {} }));
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => json([]));
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('GET', '/rest/v1/budgets', () => rows([]));
    const payload = await buildDigestPayload(createServiceClient(makeEnv()), { userId: USER_ID, range, budgetYear: 2026, budgetMonth: 8, tz: 'Asia/Kolkata' });
    expect(payload).toMatchObject({ spent: '0.00', income: '0.00', net: '0.00', payees: [], incomeSources: [], categories: [], topExpenses: [], empty: true });
    expect(stub.find('GET', '/rest/v1/categories')).toHaveLength(0);
  });

  it('works before the aggregate migration is applied (row-paging fallback)', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () => pgError('PGRST202', 'missing', 404));
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () => pgError('PGRST202', 'missing', 404));
    stub.on('GET', '/rest/v1/transactions', (call) => {
      const select = call.params.get('select') ?? '';
      if (select === 'amount,type,category_id') return rows([{ amount: 100, type: 'debit', category_id: null }, { amount: 40, type: 'credit', category_id: null }]);
      if (select.includes('counterparty_normalized') && !select.includes('user_id')) {
        return rows([{ amount: 100, type: 'debit', counterparty_name: 'Metro', counterparty_normalized: 'metro', transaction_at: '2026-08-12T10:00:00Z' }]);
      }
      return rows([]);
    });
    stub.on('GET', '/rest/v1/budgets', () => rows([]));
    const payload = await buildDigestPayload(createServiceClient(makeEnv()), { userId: USER_ID, range, budgetYear: 2026, budgetMonth: 8, tz: 'Asia/Kolkata' });
    expect(payload).toMatchObject({ spent: '100.00', income: '40.00', net: '-60.00' });
    expect(payload.payees).toEqual([['Metro', '100.00', 1]]);
    expect(payload.categories).toEqual([['Uncategorized', '100.00', 1, false]]);
  });
});
