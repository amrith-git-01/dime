import { describe, expect, it } from 'vitest';

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
import { failingDb, failingOn, oneRow, rowsOf, seedBudget, seedCategory, seedEmailSend, seedSettings, seedTransaction, seedUser, spyDb, testDb } from './db';
import { json, useSupabaseStub } from './supabase-stub';

// Everything relational is in D1; the stub only plays Brevo (and the quote API).
const stub = useSupabaseStub();

const NOW = Date.parse('2026-08-17T02:30:00Z');
const EMAIL_ENV = {
  BREVO_API_KEY: 'brevo-key',
  EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret',
  EMAIL_FROM: 'Dime <hello@dime.test>',
  EMAIL_PUBLIC_BASE_URL: 'https://api.dime.test',
  EMAIL_APP_LINK: 'https://app.dime.test/open',
};

function deps(overrides: Record<string, string | undefined> = {}, db: D1Database = testDb()): EmailDeps {
  return createEmailDeps(makeEnv({ ...EMAIL_ENV, ...overrides }), db);
}

const KEY = { userId: USER_ID, kind: 'weekly', periodKey: '2026-W33' } as const;
const minutesBefore = (ms: number, minutes: number) => new Date(ms - minutes * 60_000).toISOString();
const sendRows = () => rowsOf<Record<string, unknown>>('email_sends');

const brevoOk = () => json({ messageId: '<m1@brevo>' }, { status: 201 });

/** One digest email's world for USER_ID: an address, the IST week of 2026-W33 with some spending, a Brevo that accepts. */
async function seedDigestWorld(opts: { email?: string | null; brevo?: () => Response } = {}) {
  await testDb()
    .prepare('UPDATE users SET email = ?, username = ? WHERE id = ?')
    .bind(opts.email === undefined ? 'amrith@example.com' : opts.email, 'Amrith', USER_ID)
    .run();
  await seedTransaction({ amount: '2000', type: 'credit', counterparty_name: 'Boss', transaction_at: '2026-08-11T10:00:00.000Z' });
  await seedTransaction({ amount: '500', type: 'debit', counterparty_name: 'Shop', transaction_at: '2026-08-12T10:00:00.000Z' });
  stub.on('POST', '/v3/smtp/email', opts.brevo ?? brevoOk);
}

describe('email_sends claim / reclaim (port of B3 tests)', () => {
  it('inserts a pending row with claimed_at', async () => {
    expect(await tryBegin(testDb(), KEY, NOW)).toBe(true);
    expect(await sendRows()).toEqual([
      expect.objectContaining({ user_id: USER_ID, kind: 'weekly', period_key: '2026-W33', status: 'pending', claimed_at: '2026-08-17T02:30:00.000Z', sent_at: null }),
    ]);
  });

  it.each([
    ['database error', 'D1_ERROR: connection lost'],
    ['network error', 'fetch failed'],
  ])('a non-unique %s propagates instead of looking "already claimed", and nothing is reclaimed', async (_name, message) => {
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33', claimed_at: minutesBefore(NOW, 60) });
    await expect(tryBegin(failingOn(/INSERT INTO email_sends/, message), KEY, NOW)).rejects.toThrow(message);
    expect((await sendRows())[0]).toMatchObject({ claimed_at: minutesBefore(NOW, 60) }); // the stale row was not touched
  });

  it('a unique clash with a fresh pending row stays claimed', async () => {
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33', claimed_at: minutesBefore(NOW, 5) });
    expect(await tryBegin(testDb(), KEY, NOW)).toBe(false);
    expect(await sendRows()).toHaveLength(1);
    expect((await sendRows())[0]).toMatchObject({ claimed_at: minutesBefore(NOW, 5) });
  });

  it('an already sent email is never reclaimed, however old', async () => {
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33', status: 'sent', claimed_at: minutesBefore(NOW, 600) });
    expect(await tryBegin(testDb(), KEY, NOW)).toBe(false);
    expect((await sendRows())[0]).toMatchObject({ status: 'sent' });
  });

  it('reclaims a pending row older than 30 minutes (conditional update, pending rows only)', async () => {
    const monthly = { ...KEY, kind: 'monthly', periodKey: '2026-09' } as const;
    await seedEmailSend({ kind: 'monthly', period_key: '2026-09', claimed_at: minutesBefore(NOW, 31) });
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33', claimed_at: minutesBefore(NOW, 31) }); // other key: untouched
    expect(await tryBegin(testDb(), monthly, NOW)).toBe(true);
    const [reclaimed, other] = await sendRows();
    expect(reclaimed).toMatchObject({ kind: 'monthly', status: 'pending', claimed_at: '2026-08-17T02:30:00.000Z' });
    expect(other).toMatchObject({ kind: 'weekly', claimed_at: minutesBefore(NOW, 31) });
    expect(PENDING_RECLAIM_AFTER_MS).toBe(30 * 60 * 1000);
    // Right at the boundary the claim is still held.
    await testDb().prepare('UPDATE email_sends SET claimed_at = ?').bind(minutesBefore(NOW, 30)).run();
    expect(await tryBegin(testDb(), monthly, NOW)).toBe(false);
  });

  it('two workers racing for one stale claim: exactly one wins', async () => {
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33', claimed_at: minutesBefore(NOW, 45) });
    const results = await Promise.all([tryBegin(testDb(), KEY, NOW), tryBegin(testDb(), KEY, NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('markSent and deletePending are scoped to the key; delete only touches pending rows', async () => {
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33' });
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W32' });
    const db = testDb();
    await markSent(db, KEY, '<id>');
    expect(await oneRow('email_sends', 'period_key = ?', '2026-W33')).toMatchObject({ status: 'sent', brevo_message_id: '<id>', sent_at: expect.stringMatching(/Z$/) as unknown });
    expect(await oneRow('email_sends', 'period_key = ?', '2026-W32')).toMatchObject({ status: 'pending', brevo_message_id: null });
    await deletePending(db, KEY); // sent: stays
    expect(await sendRows()).toHaveLength(2);
    await deletePending(db, { ...KEY, periodKey: '2026-W32' });
    expect((await sendRows()).map((r) => r['period_key'])).toEqual(['2026-W33']);
  });

  it('fetchUserEmail treats blank values as missing', async () => {
    await testDb().prepare("UPDATE users SET email = '  ', username = 'A' WHERE id = ?").bind(USER_ID).run();
    expect(await fetchUserEmail(testDb(), USER_ID)).toEqual({ email: null, username: 'A' });
    expect(await fetchUserEmail(testDb(), '99999999-9999-9999-9999-999999999999')).toEqual({ email: null, username: null });
  });
});

describe('welcome email', () => {
  const input = { userId: USER_ID, email: 'amrith@example.com', username: 'Amrith' };

  it('claims (welcome, once), sends through Brevo and marks sent', async () => {
    let statusDuringSend: unknown;
    stub.on('POST', '/v3/smtp/email', async () => {
      statusDuringSend = (await oneRow<{ status: string }>('email_sends', "kind = 'welcome'"))?.status;
      return brevoOk();
    });

    await sendWelcome(deps(), input);

    const mail = stub.last('POST', '/v3/smtp/email').body as { subject: string; htmlContent: string; to: unknown[]; headers: Record<string, string> };
    expect(mail.subject).toBe("You're in. This is Dime.");
    expect(mail.to).toEqual([{ email: 'amrith@example.com', name: 'Amrith' }]);
    // Postcards come from this Worker's static assets by default.
    expect(mail.htmlContent).toContain('https://api.dime.test/email/slide-1.png');
    expect(mail.htmlContent).toContain('https://app.dime.test/open');
    // The List-Unsubscribe header carries a signed weekly link on the Python path.
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/api\.dime\.test\/api\/v1\/email\/unsubscribe\?token=/);
    expect(decodeURIComponent(mail.headers['List-Unsubscribe'] ?? '')).toContain(`${USER_ID}|weekly|`);
    // Order: the claim exists before the send, and is marked sent afterwards.
    expect(statusDuringSend).toBe('pending');
    expect(await sendRows()).toEqual([
      expect.objectContaining({ kind: 'welcome', period_key: 'once', user_id: USER_ID, status: 'sent', brevo_message_id: '<m1@brevo>' }),
    ]);
  });

  it('uses EMAIL_ASSET_BASE_URL for the postcards when set', async () => {
    stub.on('POST', '/v3/smtp/email', brevoOk);
    await sendWelcome(deps({ EMAIL_ASSET_BASE_URL: 'https://cdn.dime.test/mail/' }), input);
    expect((stub.last('POST', '/v3/smtp/email').body as { htmlContent: string }).htmlContent).toContain('https://cdn.dime.test/mail/slide-3.png');
  });

  it('is sent once: an existing claim means no email', async () => {
    await seedEmailSend({ kind: 'welcome', period_key: 'once' });
    await sendWelcome(deps(), input);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
    stub.on('POST', '/v3/smtp/email', brevoOk);
    await testDb().prepare("UPDATE email_sends SET status = 'sent'").run();
    await sendWelcome(deps(), input);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('skips without a Brevo key, and without the unsubscribe secret (S3)', async () => {
    await sendWelcome(deps({ BREVO_API_KEY: undefined }), input);
    await sendWelcome(deps({ EMAIL_UNSUBSCRIBE_SECRET: undefined }), input);
    await sendWelcome(deps(), { ...input, email: '   ' });
    expect(stub.calls).toHaveLength(0);
    expect(await sendRows()).toHaveLength(0);
  });

  it('a failed send releases the claim and does not throw', async () => {
    stub.on('POST', '/v3/smtp/email', () => json({ message: 'bad' }, { status: 500 }));
    await expect(sendWelcome(deps(), input)).resolves.toBeUndefined();
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(1);
    expect(await sendRows()).toHaveLength(0);
  });

  it('a claim error (database down) propagates so the caller can log it', async () => {
    await expect(sendWelcome(deps({}, failingOn(/INSERT INTO email_sends/, 'D1_ERROR: down')), input)).rejects.toBeDefined();
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
  /** `n` users (u00000, u00001, ...) with the given digest switches. */
  async function seedOptedIn(n: number, flags: { weekly?: number; monthly?: number } = {}, from = 0) {
    const db = testDb();
    const users = db.prepare('INSERT INTO users (id) VALUES (?)');
    const settings = db.prepare('INSERT INTO user_settings (user_id, weekly_email_enabled, monthly_email_enabled) VALUES (?, ?, ?)');
    const ids = Array.from({ length: n }, (_, i) => `u${String(from + i).padStart(5, '0')}`);
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      await db.batch([...part.map((id) => users.bind(id)), ...part.map((id) => settings.bind(id, flags.weekly ?? 1, flags.monthly ?? 1))]);
    }
  }

  it('queues one message per opted-in user in batches of at most 100', async () => {
    await seedOptedIn(1050);
    await seedOptedIn(5, { weekly: 0 }, 5000); // weekly digest switched off: not queued
    const queue = new FakeQueue();
    const batches: number[] = [];
    const recording = {
      sendBatch: (msgs: Iterable<{ body: unknown }>) => {
        const list = [...msgs];
        batches.push(list.length);
        return queue.sendBatch(list);
      },
    };
    const { db, sqls } = spyDb();
    const result = await fanOutDigest({ db, queue: recording, config: deps().config, kind: 'weekly', nowMs: NOW });

    expect(result).toEqual({ kind: 'weekly', periodKey: '2026-W33', queued: 1050 });
    expect(batches).toEqual([...Array<number>(10).fill(100), 50]);
    expect(Math.max(...batches)).toBeLessThanOrEqual(SEND_BATCH_LIMIT);
    expect(queue.sent).toHaveLength(1050);
    expect(queue.sent[0]).toEqual({ type: 'digest', user_id: 'u00000', kind: 'weekly', period_key: '2026-W33' });
    expect(new Set(queue.sent.map((m) => (m as { user_id: string }).user_id)).size).toBe(1050);
    // Two pages of 1000 rows.
    expect(sqls.filter((s) => s.includes('FROM user_settings'))).toHaveLength(2);
  });

  it('monthly uses the monthly flag and the previous month key', async () => {
    await seedOptedIn(3);
    await seedOptedIn(2, { monthly: 0 }, 100);
    const queue = new FakeQueue();
    const result = await fanOutDigest({ db: testDb(), queue, config: deps().config, kind: 'monthly', nowMs: Date.parse('2026-09-01T02:30:00Z') });
    expect(result).toMatchObject({ kind: 'monthly', periodKey: '2026-08', queued: 3 });
    expect(queue.sent[0]).toMatchObject({ kind: 'monthly', period_key: '2026-08' });
  });

  it('exactly one full page triggers a second (empty) page request', async () => {
    await seedOptedIn(1000);
    const queue = new FakeQueue();
    const { db, sqls } = spyDb();
    const result = await fanOutDigest({ db, queue, config: deps().config, kind: 'weekly', nowMs: NOW });
    expect(result.queued).toBe(1000);
    expect(sqls.filter((s) => s.includes('FROM user_settings'))).toHaveLength(2);
  });

  it('queues nothing when Brevo or the unsubscribe secret is missing (no database read either)', async () => {
    const queue = new FakeQueue();
    for (const missing of ['BREVO_API_KEY', 'EMAIL_UNSUBSCRIBE_SECRET']) {
      const config = deps({ [missing]: undefined }).config;
      const result = await fanOutDigest({ db: failingDb('prepare'), queue, config, kind: 'weekly', nowMs: NOW });
      expect(result.queued).toBe(0);
    }
    expect(queue.sent).toHaveLength(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('a failing queue surfaces to the caller (cron logs it)', async () => {
    await seedOptedIn(2);
    const queue = new FakeQueue();
    queue.failWith = new Error('queue down');
    await expect(fanOutDigest({ db: testDb(), queue, config: deps().config, kind: 'weekly', nowMs: NOW })).rejects.toThrow('queue down');
  });

  it('listDigestUserPages pages in stable user order and only includes users with the flag on', async () => {
    await seedUser('a');
    await seedUser('b');
    await seedUser('c');
    await seedSettings({ weekly_email_enabled: 1 }, 'c');
    await seedSettings({ weekly_email_enabled: 0 }, 'b');
    await seedSettings({ weekly_email_enabled: 1 }, 'a');
    const pages: string[][] = [];
    for await (const page of listDigestUserPages(testDb(), 'weekly')) pages.push(page);
    expect(pages).toEqual([['a', 'c']]);
  });
});

describe('digest email for one user (consumer core)', () => {
  const period = digestPeriodFromKey('weekly', '2026-W33');

  it('claims, builds the payload from SQL aggregates, sends and marks sent', async () => {
    await seedDigestWorld();
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
    expect(await sendRows()).toEqual([
      expect.objectContaining({ kind: 'weekly', period_key: '2026-W33', status: 'sent', brevo_message_id: '<m1@brevo>' }),
    ]);
  });

  it('monthly digest: monthly subject and monthly unsubscribe link', async () => {
    await seedDigestWorld();
    const monthly = digestPeriodFromKey('monthly', '2026-08');
    await sendDigest(deps(), { userId: USER_ID, period: monthly as NonNullable<typeof monthly> });
    const mail = stub.last('POST', '/v3/smtp/email').body as { subject: string; htmlContent: string; headers: Record<string, string> };
    expect(mail.subject).toBe('Your August in Dime');
    expect(mail.htmlContent).toContain('Here&#x27;s August, Amrith.');
    expect(decodeURIComponent(mail.headers['List-Unsubscribe'] ?? '')).toContain(`${USER_ID}|monthly|`);
  });

  it('skips a user without an address before claiming anything', async () => {
    await seedDigestWorld({ email: null });
    expect(await sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> })).toBe('skipped');
    expect(await sendRows()).toHaveLength(0);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('skips when another worker holds a fresh claim', async () => {
    await seedDigestWorld();
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33' });
    expect(await sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> })).toBe('skipped');
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('a Brevo failure releases the claim and rethrows', async () => {
    await seedDigestWorld({ brevo: () => json({}, { status: 503 }) });
    await expect(sendDigest(deps(), { userId: USER_ID, period: period as NonNullable<typeof period> })).rejects.toBeDefined();
    expect(await sendRows()).toHaveLength(0);
  });
});

describe('processEmailMessage (queue consumer)', () => {
  const body = { type: 'digest', user_id: USER_ID, kind: 'weekly', period_key: '2026-W33' };

  it('acks a sent email', async () => {
    await seedDigestWorld();
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(1);
  });

  it('acks a duplicate delivery without sending again', async () => {
    await seedDigestWorld();
    await seedEmailSend({ kind: 'weekly', period_key: '2026-W33' });
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(stub.find('POST', '/v3/smtp/email')).toHaveLength(0);
  });

  it('transient failure: claim released, message retried with backoff', async () => {
    await seedDigestWorld({ brevo: () => json({}, { status: 429 }) });
    const message = new FakeMessage(body, 2);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(false);
    expect(message.retried).toEqual({ delaySeconds: 60 });
    expect(await sendRows()).toHaveLength(0);
  });

  it('a database hiccup before the claim is also retried', async () => {
    await seedDigestWorld();
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps({}, failingOn(/FROM users/, 'D1_ERROR: Network connection lost.')));
    expect(message.retried).toEqual({ delaySeconds: 30 });
  });

  it('permanent failure (Brevo refuses): claim released, acked, never retried', async () => {
    await seedDigestWorld({ brevo: () => json({ message: 'invalid address' }, { status: 400 }) });
    const message = new FakeMessage(body);
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();
    expect(await sendRows()).toHaveLength(0);
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
    expect(await sendRows()).toHaveLength(0);
  });

  it('backoff doubles from 30 s and caps at 10 minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 480, 600, 600]);
  });
});

describe('buildDigestPayload (SQL aggregates instead of row loops)', () => {
  /** The seeded system category "Food & Dining". */
  const CAT_FOOD = '85bf877a-f8b1-4b07-a9fb-5e8c809907ae';
  const CAT_GONE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const OTHER = '99999999-9999-9999-9999-999999999999';
  const range = { from: '2026-08-09T18:30:00.000Z', to: '2026-08-16T18:30:00.000Z' };
  const input = { userId: USER_ID, range, budgetYear: 2026, budgetMonth: 8, tz: 'Asia/Kolkata' };

  async function seedWorld(opts: { monthly?: string | null } = {}) {
    // A category the user cannot see (someone else's): counts as a custom "Category".
    await seedUser(OTHER);
    await seedCategory({ id: CAT_GONE, name: 'Theirs', user_id: OTHER });
    const debit = (amount: string, name: string | null, at: string, category: string | null) =>
      seedTransaction({ amount, type: 'debit', counterparty_name: name, transaction_at: at, category_id: category });
    await debit('400', ' Metro ', '2026-08-12T10:00:00.000Z', CAT_FOOD);
    await debit('150', 'Swiggy', '2026-08-10T20:00:00.000Z', CAT_GONE); // 11 Aug 01:30 IST
    await debit('150', 'Swiggy', '2026-08-12T00:00:00.000Z', null);
    await debit('100', 'A', '2026-08-13T10:00:00.000Z', null);
    await debit('90', 'B', '2026-08-14T10:00:00.000Z', CAT_FOOD);
    await debit('60', 'C', '2026-08-14T11:00:00.000Z', CAT_FOOD);
    await debit('50', 'D', '2026-08-14T12:00:00.000Z', CAT_FOOD);
    await seedTransaction({ amount: '2000', type: 'credit', counterparty_name: 'Boss', transaction_at: '2026-08-11T10:00:00.000Z' });
    // Earlier in the month (outside the week): only the budget month sees it.
    await debit('7200', 'Landlord', '2026-08-02T00:00:00.000Z', null);
    if (opts.monthly !== null) await seedBudget({ monthly: opts.monthly ?? '20000', daily: '0' });
  }

  it('builds every card from the aggregates', async () => {
    await seedWorld();
    const { db, sqls } = spyDb();
    const payload = await buildDigestPayload(db, input);

    expect(payload).toMatchObject({ spent: '1000.00', income: '2000.00', net: '1000.00' });
    // Python quirk kept: the "Other" bucket is the 5th row of "who you paid" (top 4 + Other).
    expect(payload.payees.map((p) => p[0])).toEqual(['Metro', 'Swiggy', 'A', 'B', 'Other']);
    expect(payload.payees[0]).toEqual(['Metro', '400.00', 1]);
    expect(payload.payees[4]).toEqual(['Other', '110.00', 110 / 400]);
    expect(payload.incomeSources).toEqual([['Boss', '2000.00', 1]]);
    // Categories: all of them, sorted by amount; unknown ids count as custom; no category is "Uncategorized".
    expect(payload.categories).toEqual([
      ['Food & Dining', '600.00', 1, false],
      ['Uncategorized', '250.00', 250 / 600, false],
      ['Category', '150.00', 150 / 600, true],
    ]);
    expect(payload.topExpenses).toEqual([
      ['Metro', '12 Aug', '400.00'],
      ['Swiggy', '12 Aug', '150.00'],
      ['Swiggy', '11 Aug', '150.00'],
      ['A', '13 Aug', '100.00'],
      ['B', '14 Aug', '90.00'],
    ]);
    expect(payload.budgetLine).toBe('₹11,800 / ₹20,000');
    expect(payload.budgetPct).toBeCloseTo(0.41);
    // Money stays in the database: a handful of statements, no per-row loops.
    expect(sqls.length).toBeLessThanOrEqual(7);
  });

  it('a nameless top expense is labelled "Expense"', async () => {
    await seedTransaction({ amount: '300.50', type: 'debit', counterparty_name: null, transaction_at: '2026-08-10T20:00:00.000Z' });
    const payload = await buildDigestPayload(testDb(), input);
    expect(payload.topExpenses).toEqual([['Expense', '11 Aug', '300.50']]);
    expect(payload.payees).toEqual([['Unknown', '300.50', 1]]);
  });

  it('no budget: no budget-month query', async () => {
    await seedWorld({ monthly: null });
    const { db, sqls } = spyDb();
    const payload = await buildDigestPayload(db, input);
    expect(payload.budgetLine).toBe('No budget set');
    expect(payload.budgetPct).toBeNull();
    // Period summary only: no second summary for the budget month.
    expect(sqls.filter((s) => s.includes('GROUP BY type, category_id'))).toHaveLength(1);
  });

  it('an empty period has no ranked rows and no categories lookup', async () => {
    const { db, sqls } = spyDb();
    const payload = await buildDigestPayload(db, input);
    expect(payload).toMatchObject({ spent: '0.00', income: '0.00', net: '0.00', payees: [], incomeSources: [], categories: [], topExpenses: [] });
    expect(sqls.filter((s) => s.includes('FROM categories'))).toHaveLength(0);
  });
});
