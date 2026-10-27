import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleEmailBatch, handleEmailDlq, processEmailMessage } from '../src/features/email/consumer';
import { runDigestCron } from '../src/features/email/digest';
import { createEmailDeps } from '../src/features/email/service';
import type { EmailDeps } from '../src/features/email/service';
import { fanOutReports, isReportFanOutDay } from '../src/features/reports/fanout';
import { reportReadyCopy } from '../src/features/reports/service';
import { FakeMessage, FakeQueue } from './ingest-fixtures';
import { USER_ID, call, makeEnv } from './helpers';
import { failingDb, failingOn, rowsOf, seedPushToken, seedSettings, seedTransaction, seedUser, spyDb, testDb } from './db';
import { json, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();

/** 08:00 IST on 1 November 2026: the report cron day. */
const NOV_1 = Date.parse('2026-11-01T02:30:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOV_1);
});
afterEach(() => vi.useRealTimers());

const EMAIL_ENV = {
  BREVO_API_KEY: 'brevo-key',
  EMAIL_UNSUBSCRIBE_SECRET: 'unsub-secret',
  EMAIL_FROM: 'Dime <hello@dime.test>',
  EMAIL_PUBLIC_BASE_URL: 'https://api.dime.test',
  EMAIL_APP_LINK: 'https://app.dime.test/open',
};

/** Consumer deps WITHOUT Brevo configured: reports must not need it. */
function deps(db: D1Database = testDb()): EmailDeps {
  return createEmailDeps(makeEnv(), db);
}

/** `n` October debits for a user, on the 2nd, 3rd, ... */
async function seedOctober(userId: string, n = 5) {
  for (let i = 0; i < n; i += 1) {
    await seedTransaction({ user_id: userId, amount: String((i + 1) * 100), counterparty_name: `Shop ${i}`, transaction_at: `2026-10-${String(i + 2).padStart(2, '0')}T10:00:00.000Z` });
  }
}

const reportBody = (userId = USER_ID, periodKey = '2026-10') => ({ type: 'report', user_id: userId, period_key: periodKey });
const notifications = () => rowsOf<Record<string, unknown>>('notifications');
const reports = () => rowsOf<Record<string, unknown>>('monthly_reports');
const notificationsCount = async () => (await notifications()).length;

/** `n` users u00001.. with five October debits each (two inserts, whatever n). */
async function seedManyEligible(n: number) {
  const db = testDb();
  await db.batch([
    db.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n}) INSERT INTO users (id) SELECT printf('u%05d', i) FROM n`),
    db.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${n * 5})
       INSERT INTO transactions (id, user_id, amount, type, detected_via, transaction_at, payee_key)
       SELECT printf('t%05d', i), printf('u%05d', (i - 1) / 5 + 1), 100, 'debit', 'manual', '2026-10-10T10:00:00.000Z', 'shop' FROM n`,
    ),
  ]);
}

describe('isReportFanOutDay', () => {
  it('is IST days 1 to 3 (the 1st plus two catch-up days), not UTC days', () => {
    expect(isReportFanOutDay(Date.parse('2026-10-31T18:29:59Z'))).toBe(false); // Oct 31, 23:59 IST
    expect(isReportFanOutDay(Date.parse('2026-10-31T18:30:00Z'))).toBe(true); // Nov 1, 00:00 IST
    expect(isReportFanOutDay(NOV_1)).toBe(true);
    expect(isReportFanOutDay(Date.parse('2026-11-03T18:29:59Z'))).toBe(true); // Nov 3, 23:59 IST
    expect(isReportFanOutDay(Date.parse('2026-11-03T18:30:00Z'))).toBe(false); // Nov 4
    expect(isReportFanOutDay(Date.parse('2026-11-15T02:30:00Z'))).toBe(false);
  });
});

describe('report fan-out', () => {
  const U2 = '22222222-2222-2222-2222-222222222222';
  const U3 = '33333333-3333-3333-3333-333333333333';
  const U4 = '44444444-4444-4444-4444-444444444444';
  const U5 = '55555555-5555-5555-5555-555555555555';

  it('queues every user with 5+ debits last month, whatever their alert setting', async () => {
    for (const id of [U2, U3, U4, U5]) await seedUser(id);
    await seedOctober(USER_ID); // no settings row
    await seedOctober(U2);
    await seedSettings({ report_alerts_enabled: 1 }, U2);
    await seedOctober(U3);
    await seedSettings({ report_alerts_enabled: 0 }, U3); // alerts off: the report is still built, only the notification is gated
    await seedOctober(U4, 4); // too few debits
    await seedTransaction({ user_id: U5, transaction_at: '2026-09-10T10:00:00.000Z' }); // 5 in September only
    for (let i = 0; i < 4; i += 1) await seedTransaction({ user_id: U5, transaction_at: `2026-09-1${i}T10:00:00.000Z` });
    await seedTransaction({ user_id: U4, transaction_at: '2026-10-20T10:00:00.000Z', deleted_at: '2026-10-21T00:00:00.000Z' });
    await seedTransaction({ user_id: U4, type: 'credit', transaction_at: '2026-10-21T10:00:00.000Z' });

    const queue = new FakeQueue();
    const result = await fanOutReports({ db: testDb(), queue, nowMs: NOV_1 });

    expect(result).toEqual({ periodKey: '2026-10', selected: 3, queued: 3, failed: 0 });
    expect(queue.sent).toEqual([reportBody(USER_ID), reportBody(U2), reportBody(U3)]);
  });

  it('catch-up: users that already have a stored report are skipped, the rest are picked again', async () => {
    for (const id of [U2, U3]) await seedUser(id);
    for (const id of [USER_ID, U2, U3]) await seedOctober(id);
    // The first run got through USER_ID only.
    await processEmailMessage(new FakeMessage(reportBody(USER_ID)), deps());

    const queue = new FakeQueue();
    const day2 = Date.parse('2026-11-02T02:30:00Z');
    expect(await fanOutReports({ db: testDb(), queue, nowMs: day2 })).toEqual({ periodKey: '2026-10', selected: 2, queued: 2, failed: 0 });
    expect(queue.sent).toEqual([reportBody(U2), reportBody(U3)]);

    // Everyone caught up: nothing left to pick.
    for (const m of queue.sent) await processEmailMessage(new FakeMessage(m), deps());
    const again = new FakeQueue();
    expect((await fanOutReports({ db: testDb(), queue: again, nowMs: Date.parse('2026-11-03T02:30:00Z') })).selected).toBe(0);
    expect(again.sent).toEqual([]);
    expect(await reports()).toHaveLength(3);
    expect(await notifications()).toHaveLength(3); // one each, no duplicates
  });

  describe('notified_at (a report is finished when its notification step is)', () => {
    const day = (d: number) => Date.parse(`2026-11-0${d}T02:30:00Z`);
    const pick = async (d: number) => {
      const queue = new FakeQueue();
      await fanOutReports({ db: testDb(), queue, nowMs: day(d) });
      return queue.sent;
    };
    const notifiedAt = async () => (await reports())[0]?.['notified_at'];

    it('a snapshot whose notification failed is picked again on day 2 and notified exactly once; day 3 picks nothing', async () => {
      await seedOctober(USER_ID);
      const failed = new FakeMessage(reportBody());
      await processEmailMessage(failed, deps(failingOn(/INSERT INTO notifications/, 'D1_ERROR: boom')));
      expect(failed.acked).toBe(true); // a permanent error: no retry
      expect(await reports()).toHaveLength(1); // the snapshot is stored...
      expect(await notifiedAt()).toBeNull(); // ...but the notification step never finished
      expect(await notifications()).toHaveLength(0);

      expect(await pick(1)).toEqual([reportBody()]);
      expect(await pick(2)).toEqual([reportBody()]);
      for (const m of await pick(2)) await processEmailMessage(new FakeMessage(m), deps());
      expect(await notifications()).toHaveLength(1);
      expect(await notifiedAt()).not.toBeNull();
      expect(await pick(3)).toEqual([]);

      // A late redelivery of the old message changes nothing.
      await processEmailMessage(new FakeMessage(reportBody(), 2), deps());
      expect(await notifications()).toHaveLength(1);
      expect(await reports()).toHaveLength(1);
    });

    it('an alerts-off user is marked notified (handled) and is not picked again', async () => {
      await seedOctober(USER_ID);
      await seedSettings({ report_alerts_enabled: 0 });
      expect(await pick(1)).toEqual([reportBody()]);
      await processEmailMessage(new FakeMessage(reportBody()), deps());
      expect(await reports()).toHaveLength(1);
      expect(await notificationsCount()).toBe(0);
      expect(await notifiedAt()).not.toBeNull();
      expect(await pick(2)).toEqual([]);
    });

    it('an older-version row is picked again and rebuilt (notified_at kept); a current or newer row is not', async () => {
      await seedOctober(USER_ID);
      await processEmailMessage(new FakeMessage(reportBody()), deps());
      const notified = await notifiedAt();
      expect(notified).not.toBeNull();
      expect(await pick(2)).toEqual([]); // current version, notified

      await testDb().prepare("UPDATE monthly_reports SET version = 0, snapshot = '{\"old\":true}'").run();
      expect(await pick(2)).toEqual([reportBody()]);
      await processEmailMessage(new FakeMessage(reportBody()), deps());
      const [row] = await reports();
      expect(row).toMatchObject({ version: 1, notified_at: notified });
      expect(JSON.parse(String(row?.['snapshot']))).toMatchObject({ version: 1, debit_count: 5 });
      expect(await notifications()).toHaveLength(1); // the version bump does not notify again
      expect(await pick(3)).toEqual([]);

      await testDb().prepare('UPDATE monthly_reports SET version = 2').run(); // written by a newer deploy
      expect(await pick(3)).toEqual([]);
    });
  });

  it('a queue failure on one chunk does not stop the others, and is counted', async () => {
    await seedManyEligible(250);
    const sent: number[] = [];
    let calls = 0;
    const flaky = {
      sendBatch: (msgs: Iterable<{ body: unknown }>) => {
        const list = [...msgs];
        calls += 1;
        if (calls === 2) return Promise.reject(new Error('queue hiccup'));
        sent.push(list.length);
        return Promise.resolve();
      },
    };
    const result = await fanOutReports({ db: testDb(), queue: flaky, nowMs: NOV_1 });
    expect(result).toEqual({ periodKey: '2026-10', selected: 250, queued: 150, failed: 100 });
    expect(sent).toEqual([100, 50]);
  });

  it('an explicit period_key picks that finished month instead', async () => {
    await seedUser(U2);
    await seedOctober(USER_ID);
    for (let i = 0; i < 5; i += 1) await seedTransaction({ user_id: U2, transaction_at: `2026-09-1${i}T10:00:00.000Z` });
    const queue = new FakeQueue();
    expect(await fanOutReports({ db: testDb(), queue, nowMs: NOV_1, periodKey: '2026-09' })).toMatchObject({ periodKey: '2026-09', queued: 1 });
    expect(queue.sent).toEqual([reportBody(U2, '2026-09')]);
  });

  it('counts the month in IST: 19:00Z on Sep 30 is an October debit', async () => {
    for (let i = 0; i < 4; i += 1) await seedTransaction({ transaction_at: `2026-10-0${i + 2}T10:00:00.000Z` });
    const queue = new FakeQueue();
    expect((await fanOutReports({ db: testDb(), queue, nowMs: NOV_1 })).queued).toBe(0);
    await seedTransaction({ transaction_at: '2026-09-30T19:00:00.000Z' });
    expect((await fanOutReports({ db: testDb(), queue, nowMs: NOV_1 })).queued).toBe(1);
    // ...and one at 18:30Z on Oct 31 is already a November one.
    await testDb().prepare("UPDATE transactions SET transaction_at = '2026-10-31T18:30:00.000Z' WHERE transaction_at = '2026-09-30T19:00:00.000Z'").run();
    expect((await fanOutReports({ db: testDb(), queue, nowMs: NOV_1 })).queued).toBe(0);
  });

  it('pages through the users and sends at most 100 per queue call', async () => {
    await seedManyEligible(1050);
    const queue = new FakeQueue();
    const batches: number[] = [];
    const recording = {
      sendBatch: (msgs: Iterable<{ body: unknown }>) => {
        const list = [...msgs];
        batches.push(list.length);
        return queue.sendBatch(list);
      },
    };
    const spy = spyDb();
    const result = await fanOutReports({ db: spy.db, queue: recording, nowMs: NOV_1 });

    expect(result.queued).toBe(1050);
    expect(batches).toEqual([...Array<number>(10).fill(100), 50]);
    expect(queue.sent[0]).toEqual(reportBody('u00001', '2026-10'));
    expect(new Set(queue.sent.map((m) => (m as { user_id: string }).user_id)).size).toBe(1050);
    expect(spy.sqls.filter((s) => s.includes('NOT EXISTS'))).toHaveLength(2); // two pages of 1000 and 50
  });
});

describe('cron entry point (runDigestCron)', () => {
  it('fans out reports on IST days 1 to 3 only', async () => {
    await seedOctober(USER_ID);
    for (const [at, expected] of [
      ['2026-10-31T18:29:00Z', 0], // still Oct 31 in Kolkata
      ['2026-10-31T18:30:00Z', 1], // Nov 1, 00:00 IST
      ['2026-11-01T02:30:00Z', 1], // the real cron time
      ['2026-11-02T02:30:00Z', 1], // catch-up day 2: nobody has a stored report yet
      ['2026-11-03T02:30:00Z', 1], // catch-up day 3
      ['2026-11-04T02:30:00Z', 0],
      ['2026-11-15T02:30:00Z', 0],
    ] as const) {
      const queue = new FakeQueue();
      await runDigestCron(makeEnv({ EMAIL_QUEUE: queue }), Date.parse(at));
      expect(queue.sent.length, at).toBe(expected);
    }
  });

  it('day 2 queues only users missing their report; day 4 queues nothing', async () => {
    const other = '22222222-2222-2222-2222-222222222222';
    await seedUser(other);
    await seedOctober(USER_ID);
    await seedOctober(other);
    await processEmailMessage(new FakeMessage(reportBody(USER_ID)), deps()); // stored; the other user was missed

    const day2 = new FakeQueue();
    await runDigestCron(makeEnv({ EMAIL_QUEUE: day2 }), Date.parse('2026-11-02T02:30:00Z'));
    expect(day2.sent).toEqual([reportBody(other)]);

    const day4 = new FakeQueue();
    await runDigestCron(makeEnv({ EMAIL_QUEUE: day4 }), Date.parse('2026-11-04T02:30:00Z'));
    expect(day4.sent).toEqual([]);
  });

  it('a queue chunk that fails makes the run fail (so it shows up), after the other chunks went out', async () => {
    await seedManyEligible(150);
    let calls = 0;
    const sent: number[] = [];
    const flaky = {
      sendBatch: (msgs: Iterable<unknown>) => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error('queue hiccup'));
        sent.push([...msgs].length);
        return Promise.resolve();
      },
    };
    await expect(runDigestCron(makeEnv({ EMAIL_QUEUE: flaky }), NOV_1)).rejects.toThrow('100 of 150');
    expect(sent).toEqual([50]);
  });

  it('shares the queue with the monthly digest when email is configured', async () => {
    await seedOctober(USER_ID);
    await seedSettings({ monthly_email_enabled: 1, weekly_email_enabled: 0 });
    const queue = new FakeQueue();
    await runDigestCron(makeEnv({ ...EMAIL_ENV, EMAIL_QUEUE: queue }), NOV_1);
    expect(queue.sent).toEqual(
      expect.arrayContaining([{ type: 'digest', user_id: USER_ID, kind: 'monthly', period_key: '2026-10' }, reportBody(USER_ID)]),
    );
    expect(queue.sent).toHaveLength(2);
  });

  it('a failing report fan-out does not skip the digests, and is still reported', async () => {
    await seedOctober(USER_ID);
    await seedSettings({ monthly_email_enabled: 1, weekly_email_enabled: 0 });
    const queue = new FakeQueue();
    const env = makeEnv({ ...EMAIL_ENV, EMAIL_QUEUE: queue, DB: failingOn(/NOT EXISTS/, 'D1_ERROR: boom') });
    await expect(runDigestCron(env, NOV_1)).rejects.toThrow('boom');
    expect(queue.sent).toEqual([{ type: 'digest', user_id: USER_ID, kind: 'monthly', period_key: '2026-10' }]);
  });

  it('a failing digest fan-out does not skip the reports either', async () => {
    await seedOctober(USER_ID);
    await seedSettings({ monthly_email_enabled: 1, weekly_email_enabled: 0 });
    const queue = new FakeQueue();
    const env = makeEnv({ ...EMAIL_ENV, EMAIL_QUEUE: queue, DB: failingOn(/monthly_email_enabled = 1/, 'D1_ERROR: digest boom') });
    await expect(runDigestCron(env, NOV_1)).rejects.toThrow('digest boom');
    expect(queue.sent).toEqual([reportBody(USER_ID)]);
  });
});

describe('report message consumer', () => {
  it('builds the snapshot and raises one report_ready notification', async () => {
    await seedOctober(USER_ID);
    const message = new FakeMessage(reportBody());
    await processEmailMessage(message, deps());

    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();
    expect(await reports()).toEqual([expect.objectContaining({ user_id: USER_ID, period_key: '2026-10', version: 1, viewed_at: null })]);
    expect(await notifications()).toEqual([
      expect.objectContaining({
        user_id: USER_ID,
        kind: 'report_ready',
        title: 'Your October Broke Report is ready',
        body: 'See how your wallet did.',
        action_type: 'report',
        action_transaction_id: null,
        action_period_key: '2026-10',
        dedupe_key: 'report:2026-10',
        read_at: null,
      }),
    ]);
  });

  it('does not need Brevo (email unconfigured is irrelevant to reports)', async () => {
    await seedOctober(USER_ID);
    const message = new FakeMessage(reportBody());
    await processEmailMessage(message, createEmailDeps(makeEnv({ BREVO_API_KEY: undefined, EMAIL_UNSUBSCRIBE_SECRET: undefined }), testDb()));
    expect(message.acked).toBe(true);
    expect(await notifications()).toHaveLength(1);
  });

  it('a redelivery changes nothing: one snapshot, one notification, one push', async () => {
    await seedOctober(USER_ID);
    await seedPushToken('ExponentPushToken[abc]');
    stub.on('POST', '/--/api/v2/push/send', () => json({ data: [{ status: 'ok' }] }));

    await processEmailMessage(new FakeMessage(reportBody()), deps());
    const snapshot = (await reports())[0]?.['snapshot'];
    vi.setSystemTime(NOV_1 + 3_600_000);
    const again = new FakeMessage(reportBody(), 2);
    await processEmailMessage(again, deps());

    expect(again.acked).toBe(true);
    expect(await reports()).toHaveLength(1);
    expect((await reports())[0]?.['snapshot']).toBe(snapshot);
    expect(await notifications()).toHaveLength(1);
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(1);
  });

  it('pushes with the period in the data, so the app can open the report', async () => {
    await seedOctober(USER_ID);
    await seedPushToken('ExponentPushToken[abc]');
    stub.on('POST', '/--/api/v2/push/send', () => json({ data: [{ status: 'ok' }] }));
    await processEmailMessage(new FakeMessage(reportBody()), deps());

    const [push] = stub.last('POST', '/--/api/v2/push/send').body as Record<string, unknown>[];
    expect(push).toMatchObject({
      to: 'ExponentPushToken[abc]',
      title: 'Your October Broke Report is ready',
      body: 'See how your wallet did.',
      data: { kind: 'report_ready', action_type: 'report', action_transaction_id: null, period_key: '2026-10' },
    });
    expect((push?.['data'] as Record<string, unknown>)['notification_id']).toBe((await notifications())[0]?.['id']);
  });

  it('no push when device notifications are off (the inbox row is still raised)', async () => {
    await seedOctober(USER_ID);
    await seedPushToken('ExponentPushToken[abc]');
    await seedSettings({ device_notifications_enabled: 0 });
    await processEmailMessage(new FakeMessage(reportBody()), deps());
    expect(await notifications()).toHaveLength(1);
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(0);
  });

  it('report alerts off: the snapshot is still built, but no notification and no push', async () => {
    await seedOctober(USER_ID);
    await seedPushToken('ExponentPushToken[abc]');
    await seedSettings({ report_alerts_enabled: 0 });
    const message = new FakeMessage(reportBody());
    await processEmailMessage(message, deps());
    expect(message.acked).toBe(true);
    expect(await reports()).toEqual([expect.objectContaining({ period_key: '2026-10', version: 1 })]);
    expect(await notifications()).toHaveLength(0);
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(0);
  });

  it('one user\'s failure does not block the others in the same batch', async () => {
    const U2 = '22222222-2222-2222-2222-222222222222';
    const U3 = '33333333-3333-3333-3333-333333333333';
    for (const id of [U2, U3]) await seedUser(id);
    for (const id of [USER_ID, U2, U3]) await seedOctober(id);

    // The database "hiccups" for U2 only.
    const real = testDb();
    const flaky = new Proxy(real, {
      get(target, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (!/FROM monthly_reports/.test(sql)) return statement;
            return {
              bind: (...args: unknown[]) => {
                if (args.includes(U2)) throw new Error('D1_ERROR: Network connection lost.');
                return statement.bind(...args);
              },
            };
          };
        }
        const value = Reflect.get(target, prop, target) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    const messages = [USER_ID, U2, U3].map((id) => new FakeMessage(reportBody(id)));
    await handleEmailBatch({ messages } as unknown as MessageBatch<unknown>, makeEnv({ DB: flaky }));

    expect(messages.map((m) => [m.acked, m.retried !== undefined])).toEqual([
      [true, false],
      [false, true], // U2 is retried
      [true, false],
    ]);
    expect((await reports()).map((r) => r['user_id']).sort()).toEqual([USER_ID, U3]);
    expect(await notifications()).toHaveLength(2);

    // The retry (and tomorrow's catch-up) finishes the job.
    const queue = new FakeQueue();
    await fanOutReports({ db: testDb(), queue, nowMs: Date.parse('2026-11-02T02:30:00Z') });
    expect(queue.sent).toEqual([reportBody(U2)]);
  });

  it('broadcasts the new notification to the live channel', async () => {
    await seedOctober(USER_ID);
    const publisher = vi.fn();
    await processEmailMessage(new FakeMessage(reportBody()), { ...deps(), publisher });
    expect(publisher).toHaveBeenCalledTimes(1);
    expect(publisher.mock.calls[0]?.[0]).toBe(USER_ID);
    await processEmailMessage(new FakeMessage(reportBody(), 2), { ...deps(), publisher });
    expect(publisher).toHaveBeenCalledTimes(1); // deduped: nothing new to announce
  });

  it('the inbox exposes the period only on report notifications', async () => {
    await seedOctober(USER_ID);
    await processEmailMessage(new FakeMessage(reportBody()), deps());
    const res = await call('/api/v1/notifications');
    const body = await res.json<{ items: { kind: string; action: Record<string, unknown> }[] }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.kind).toBe('report_ready');
    expect(body.items[0]?.action).toEqual({ type: 'report', transaction_id: null, period_key: '2026-10' });
  });

  it('a month without a report (too few debits, a bad period, the current month) is acked and leaves nothing behind', async () => {
    await seedOctober(USER_ID, 4);
    for (const body of [reportBody(), reportBody(USER_ID, '2026-13'), reportBody(USER_ID, '2026-11')]) {
      const message = new FakeMessage(body);
      await processEmailMessage(message, deps());
      expect(message.acked, JSON.stringify(body)).toBe(true);
      expect(message.retried).toBeUndefined();
    }
    expect(await reports()).toHaveLength(0);
    expect(await notifications()).toHaveLength(0);
  });

  it('malformed bodies are acked untouched', async () => {
    for (const bad of [null, 'text', { type: 'report' }, { type: 'report', user_id: USER_ID }, { type: 'report', user_id: USER_ID, period_key: 'October' }, { type: 'other' }]) {
      const message = new FakeMessage(bad);
      await processEmailMessage(message, deps());
      expect(message.acked, JSON.stringify(bad)).toBe(true);
    }
    expect(await notifications()).toHaveLength(0);
  });

  it('transient failure (a database hiccup): retried with backoff, nothing half-done', async () => {
    await seedOctober(USER_ID);
    const message = new FakeMessage(reportBody(), 2);
    await processEmailMessage(message, deps(failingOn(/FROM transactions/, 'D1_ERROR: Network connection lost.')));
    expect(message.acked).toBe(false);
    expect(message.retried).toEqual({ delaySeconds: 60 });
    expect(await reports()).toHaveLength(0);
    expect(await notifications()).toHaveLength(0);

    // The retry succeeds.
    const retry = new FakeMessage(reportBody(), 3);
    await processEmailMessage(retry, deps());
    expect(retry.acked).toBe(true);
    expect(await notifications()).toHaveLength(1);
  });

  it('permanent failure: logged and acked, never retried', async () => {
    await seedOctober(USER_ID);
    const message = new FakeMessage(reportBody());
    await processEmailMessage(message, deps(failingOn(/FROM monthly_reports/, 'D1_ERROR: no such table: monthly_reports')));
    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();

    const total = new FakeMessage(reportBody());
    await processEmailMessage(total, deps(failingDb('prepare', 'something is deeply wrong')));
    expect(total.acked).toBe(true);
    expect(total.retried).toBeUndefined();
  });
});

describe('report notification copy', () => {
  it('names the month in English', () => {
    expect(reportReadyCopy(1)).toEqual({ title: 'Your January Broke Report is ready', body: 'See how your wallet did.' });
    expect(reportReadyCopy(12).title).toBe('Your December Broke Report is ready');
  });
});

describe('dead-letter queue', () => {
  it('acks report messages (nothing to undo) and invalid ones alike', () => {
    const messages = [new FakeMessage(reportBody()), new FakeMessage({ type: 'digest', user_id: USER_ID, kind: 'monthly', period_key: '2026-10' }), new FakeMessage('junk')];
    handleEmailDlq({ messages } as unknown as MessageBatch<unknown>);
    expect(messages.every((m) => m.acked)).toBe(true);
  });
});

describe('POST /api/v1/internal/reports/run (manual trigger)', () => {
  const CRON_SECRET = 'cron-secret-for-tests';
  const setup = () => {
    const queue = new FakeQueue();
    const env = makeEnv({ EMAIL_CRON_SECRET: CRON_SECRET, EMAIL_QUEUE: queue });
    const run = (body?: unknown, headers: Record<string, string> = { 'X-Email-Cron-Secret': CRON_SECRET }) =>
      call('/api/v1/internal/reports/run', { method: 'POST', ...(body === undefined ? {} : { json: body }), token: false, headers, env });
    return { queue, run };
  };

  it('rejects a missing or wrong secret and queues nothing', async () => {
    await seedOctober(USER_ID);
    const { queue, run } = setup();
    expect((await run({}, {})).status).toBe(401);
    expect((await run({}, { 'X-Email-Cron-Secret': 'nope' })).status).toBe(401);
    expect(await (await run({}, {})).json()).toEqual({ detail: 'Unauthorized.' });
    const unconfigured = await call('/api/v1/internal/reports/run', { method: 'POST', json: {}, token: false, headers: { 'X-Email-Cron-Secret': '' }, env: makeEnv({ EMAIL_CRON_SECRET: undefined }) });
    expect(unconfigured.status).toBe(401);
    expect(queue.sent).toEqual([]);
  });

  it('with the secret and no body, runs the same fan-out as the cron for the previous month', async () => {
    await seedOctober(USER_ID);
    const { queue, run } = setup();
    const res = await run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ period_key: '2026-10', selected: 1, queued: 1, failed: 0 });
    expect(queue.sent).toEqual([reportBody()]);
  });

  it('is idempotent: once the report is stored the user is no longer selected', async () => {
    await seedOctober(USER_ID);
    const { queue, run } = setup();
    await run({});
    for (const m of queue.sent) await processEmailMessage(new FakeMessage(m), deps());
    expect(await (await run({})).json()).toEqual({ period_key: '2026-10', selected: 0, queued: 0, failed: 0 });
    expect(await notifications()).toHaveLength(1);
  });

  it('takes an optional period_key for another finished month; the current month and junk are refused', async () => {
    await seedUser('22222222-2222-2222-2222-222222222222');
    await seedOctober(USER_ID);
    for (let i = 0; i < 5; i += 1) await seedTransaction({ user_id: '22222222-2222-2222-2222-222222222222', transaction_at: `2026-09-1${i}T10:00:00.000Z` });
    const { queue, run } = setup();
    expect(await (await run({ period_key: '2026-09' })).json()).toEqual({ period_key: '2026-09', selected: 1, queued: 1, failed: 0 });
    expect(queue.sent).toEqual([reportBody('22222222-2222-2222-2222-222222222222', '2026-09')]);

    expect((await run({ period_key: '2026-11' })).status).toBe(400); // November is still running
    expect((await run({ period_key: '2027-01' })).status).toBe(400);
    expect((await run({ period_key: 'October' })).status).toBe(422);
    expect(queue.sent).toHaveLength(1);
  });
});
