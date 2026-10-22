import { describe, expect, it } from 'vitest';

import type { Bindings } from '../src/core/env';
import { ENGINE_CRON, fanOutEngine, resolveTimezone, runEngineForUser } from '../src/features/engine/job';
import { markEngineDirty } from '../src/features/engine/dirty';
import type { EngineProfile } from '../src/features/engine/patterns';
import worker from '../src/index';
import { USER_ID, call, makeEnv } from './helpers';
import { failingOn, oneRow, rowsOf, seedCategory, seedTransaction, seedUser, testDb, uid, withBeforeExec } from './db';
import { FakeMessage, FakeQueue, fakeBatch } from './ingest-fixtures';

const DAY = 86_400_000;
/** Thursday 2026-10-22, 03:00 UTC (08:30 IST). */
const NOW = Date.parse('2026-10-22T03:00:00.000Z');
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const OTHER = '22222222-2222-2222-2222-222222222222';
const ctx = {} as ExecutionContext;
const controller = (cron: string, scheduledTime = NOW) => ({ cron, scheduledTime, type: 'scheduled', noRetry: () => undefined }) as ScheduledController;

const profileOf = async (userId = USER_ID) => JSON.parse((await oneRow<{ profile: string }>('engine_patterns', 'user_id = ?', userId))!.profile) as EngineProfile;
const dirtyOf = async (userId = USER_ID) => (await oneRow<{ dirty: number }>('engine_patterns', 'user_id = ?', userId))?.dirty;
const clearDirty = () => testDb().prepare('UPDATE engine_patterns SET dirty = 0').run();

/** A Swiggy order every 4 days for 40 days, plus a salary on the 1st of three months. */
async function seedHistory(userId = USER_ID) {
  for (let ago = 3; ago <= 40; ago += 4) await seedTransaction({ user_id: userId, amount: '200', counterparty_name: 'Swiggy', transaction_at: at(ago) });
  for (const month of ['2026-08-01', '2026-09-01', '2026-10-01']) {
    await seedTransaction({ user_id: userId, amount: '80000', type: 'credit', counterparty_name: 'Acme Corp', transaction_at: `${month}T04:00:00.000Z` });
  }
}

describe('markEngineDirty', () => {
  it('creates a stub row, then only flips the flag on an existing profile', async () => {
    await markEngineDirty(testDb(), USER_ID);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ version: 0, history_days: 0, profile: '{}', dirty: 1, dirty_seq: 1, timezone: null });

    await seedHistory();
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await dirtyOf()).toBe(0);
    await markEngineDirty(testDb(), USER_ID);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ version: 1, dirty: 1, dirty_seq: 2 });
  });

  it('never throws', async () => {
    await expect(markEngineDirty(failingOn(/engine_patterns/), USER_ID)).resolves.toBeUndefined();
  });
});

describe('dirty flag on transaction writes', () => {
  const create = (env?: Bindings) =>
    call('/api/v1/transactions?timezone=Asia%2FKolkata', {
      method: 'POST',
      json: { amount: '120', type: 'debit', counterparty_name: 'Chai Point', transaction_at: '2026-10-04T10:00:00+05:30' },
      ...(env ? { env } : {}),
    });

  it('is set by create, update and delete', async () => {
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toBeNull();
    const created = await create();
    expect(created.status).toBe(201);
    expect(await dirtyOf()).toBe(1);
    const { id } = await created.json<{ id: string }>();

    await clearDirty();
    const patched = await call(`/api/v1/transactions/${id}`, {
      method: 'PATCH',
      json: { amount: '130', type: 'debit', counterparty_name: 'Chai Point', transaction_at: '2026-10-04T10:00:00+05:30' },
    });
    expect(patched.status).toBe(200);
    expect(await dirtyOf()).toBe(1);

    await clearDirty();
    expect((await call(`/api/v1/transactions/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await dirtyOf()).toBe(1);
  });

  it('is set when a duplicate merges missing fields into the existing row', async () => {
    const body = { amount: '120', type: 'debit', counterparty_name: 'Chai Point', transaction_at: '2026-10-04T10:00:00+05:30' };
    const post = (extra: Record<string, unknown>) => call('/api/v1/transactions?timezone=Asia%2FKolkata', { method: 'POST', json: { ...body, ...extra } });
    await post({});
    await clearDirty();
    await post({ note: 'with a note now' });
    expect(await dirtyOf()).toBe(1);
  });

  it('is set when deleting a category moves its transactions', async () => {
    const custom = await seedCategory({ name: 'Custom' });
    const target = await seedCategory({ name: 'Target' });
    await seedTransaction({ category_id: custom });
    const res = await call(`/api/v1/categories/${custom}?reassign_to_category_id=${target}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await dirtyOf()).toBe(1);
  });

  it('a failing mark does not fail the write', async () => {
    const res = await create(makeEnv({ DB: failingOn(/engine_patterns/) }));
    expect(res.status).toBe(201);
    expect(await rowsOf('transactions')).toHaveLength(1);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toBeNull();
  });
});

describe('resolveTimezone', () => {
  const addRecurring = (tz: string, updatedAt: string, active = 1) =>
    testDb()
      .prepare(
        `INSERT INTO recurring_items (id, user_id, kind, name, amount, cadence, day_of_month, timezone, next_due_date, active, updated_at)
         VALUES (?, ?, 'subscription', 'Netflix', 64900, 'monthly', 5, ?, '2026-11-05', ?, ?)`,
      )
      .bind(uid(), USER_ID, tz, active, updatedAt)
      .run();

  it('defaults to Asia/Kolkata', async () => {
    expect(await resolveTimezone(testDb(), USER_ID)).toBe('Asia/Kolkata');
  });

  it('uses the newest active recurring item, then an explicit override', async () => {
    await addRecurring('Europe/London', '2026-01-01T00:00:00.000Z');
    await addRecurring('America/New_York', '2026-02-01T00:00:00.000Z');
    await addRecurring('Asia/Tokyo', '2026-03-01T00:00:00.000Z', 0);
    expect(await resolveTimezone(testDb(), USER_ID)).toBe('America/New_York');

    await markEngineDirty(testDb(), USER_ID);
    await testDb().prepare("UPDATE engine_patterns SET timezone = 'Australia/Sydney'").run();
    expect(await resolveTimezone(testDb(), USER_ID)).toBe('Australia/Sydney');
  });

  it('falls back when the stored name is not a timezone', async () => {
    await addRecurring('Not/AZone', '2026-01-01T00:00:00.000Z');
    expect(await resolveTimezone(testDb(), USER_ID)).toBe('Asia/Kolkata');
  });
});

describe('runEngineForUser', () => {
  it('writes the profile and payee cadences and clears dirty', async () => {
    await seedHistory();
    await markEngineDirty(testDb(), USER_ID);
    const result = await runEngineForUser(makeEnv(), USER_ID, NOW);

    expect(result).toMatchObject({ userId: USER_ID, historyDays: 82, mode: 'full', payees: 2 });
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ version: 1, history_days: 82, dirty: 0, computed_at: new Date(NOW).toISOString() });
    const profile = await profileOf();
    expect(profile).toMatchObject({ timezone: 'Asia/Kolkata', mode: 'full', windowDays: 90, widthFactor: 1, months: ['2026-08', '2026-09'] });
    expect(profile.weekday.flatMap((w) => w.values).filter((v) => v > 0)).toHaveLength(10); // ten 4-day-apart orders, all in the 90-day window
    expect(profile.payday).toBe(1);

    const rows = await rowsOf<Record<string, unknown>>('payee_patterns', 'user_id = ?', USER_ID);
    expect(rows.map((r) => [r['payee_key'], r['kind']]).sort()).toEqual([['acme corp', 'income'], ['swiggy', 'habit']]);
    expect(rows.find((r) => r['payee_key'] === 'swiggy')).toMatchObject({ display_name: 'Swiggy', count_120d: 10, median_amount: 20000, median_interval_days: 4, alpha: 2, beta: 1, suppressed: 0 });
  });

  it('keeps alpha, beta and suppressed on recompute and deletes payees that stopped qualifying', async () => {
    await seedHistory();
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    await testDb().prepare("UPDATE payee_patterns SET alpha = 6.5, beta = 2, suppressed = 1 WHERE payee_key = 'swiggy'").run();
    await testDb().prepare("UPDATE transactions SET deleted_at = ? WHERE counterparty_name = 'Acme Corp'").bind(new Date(NOW).toISOString()).run();

    await runEngineForUser(makeEnv(), USER_ID, NOW);
    const rows = await rowsOf<Record<string, unknown>>('payee_patterns', 'user_id = ?', USER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ payee_key: 'swiggy', alpha: 6.5, beta: 2, suppressed: 1, count_120d: 10 });
    expect((await profileOf()).payday).toBeNull();
  });

  it('leaves flexible baselines alone for bills, self transfers, fixed categories and one-off labels', async () => {
    const fixedCategory = await seedCategory({ name: 'Rent X', scope: 'recurring_expense' });
    await seedTransaction({ amount: '100', transaction_at: at(30) }); // history starts 30 days ago
    await seedTransaction({ amount: '9000', counterparty_name: 'Landlord', category_id: fixedCategory, transaction_at: at(2) });
    await seedTransaction({ amount: '9000', counterparty_name: 'My Savings', counterparty_type: 'self_transfer', transaction_at: at(3) });
    const oneOff = await seedTransaction({ amount: '9000', counterparty_name: 'Croma', transaction_at: at(4) });
    await testDb().prepare("INSERT INTO txn_labels (transaction_id, user_id, one_off, source, labelled_at) VALUES (?, ?, 1, 'user', ?)").bind(oneOff, USER_ID, at(0)).run();

    await runEngineForUser(makeEnv(), USER_ID, NOW);
    const profile = await profileOf();
    expect(profile.weekday.flatMap((w) => w.values).reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('keeps a dismissed or learned payee as inactive when it stops qualifying, and restores it when it returns', async () => {
    await seedHistory();
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    await testDb().prepare("UPDATE payee_patterns SET suppressed = 1, alpha = 6.5, beta = 2 WHERE payee_key = 'swiggy'").run();
    // Swiggy drops to two live transactions: it no longer has a cadence.
    await testDb().prepare("UPDATE transactions SET deleted_at = ? WHERE counterparty_name = 'Swiggy' AND transaction_at < ?").bind(at(0), at(8)).run();

    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await oneRow('payee_patterns', "payee_key = 'swiggy'")).toMatchObject({ count_120d: 0, next_expected_at: null, suppressed: 1, alpha: 6.5, beta: 2 });

    await testDb().prepare("UPDATE transactions SET deleted_at = NULL WHERE counterparty_name = 'Swiggy'").run();
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await oneRow('payee_patterns', "payee_key = 'swiggy'")).toMatchObject({ count_120d: 10, suppressed: 1, alpha: 6.5, beta: 2 });
    expect(await oneRow('payee_patterns', "payee_key = 'swiggy'")).not.toMatchObject({ next_expected_at: null });
  });

  it('restarts the confidence prior when the kind changes, unless the payee is suppressed', async () => {
    for (const d of ['2026-08-05', '2026-09-05', '2026-10-05']) await seedTransaction({ amount: '649', counterparty_name: 'Netflix', transaction_at: `${d}T04:00:00.000Z` });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await oneRow('payee_patterns', "payee_key = 'netflix'")).toMatchObject({ kind: 'subscription', alpha: 2, beta: 1 });

    await testDb().prepare("UPDATE payee_patterns SET kind = 'habit', alpha = 5, beta = 4").run();
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await oneRow('payee_patterns', "payee_key = 'netflix'")).toMatchObject({ kind: 'subscription', alpha: 2, beta: 1 });

    await testDb().prepare("UPDATE payee_patterns SET kind = 'habit', alpha = 5, beta = 4, suppressed = 1").run();
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await oneRow('payee_patterns', "payee_key = 'netflix'")).toMatchObject({ kind: 'subscription', alpha: 5, beta: 4, suppressed: 1 });
  });

  it('keeps dirty set when a write lands while the job runs', async () => {
    await seedHistory();
    await runEngineForUser(makeEnv(), USER_ID, NOW); // a profile row exists (dirty_seq 0)
    // A mark right before the job loads its rows, i.e. after it read dirty_seq.
    const racing = withBeforeExec(/FROM transactions t LEFT JOIN categories/, () => markEngineDirty(testDb(), USER_ID));
    await runEngineForUser(makeEnv({ DB: racing }), USER_ID, NOW);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ dirty: 1, dirty_seq: 1 });

    await runEngineForUser(makeEnv(), USER_ID, NOW); // no write during this one
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ dirty: 0, dirty_seq: 1 });
  });

  it('keeps dirty set when the first write creates the row while the very first job runs', async () => {
    await seedHistory();
    const racing = withBeforeExec(/FROM transactions t LEFT JOIN categories/, () => markEngineDirty(testDb(), USER_ID));
    await runEngineForUser(makeEnv({ DB: racing }), USER_ID, NOW);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ version: 1, dirty: 1 });
  });

  it('works for a user with no transactions', async () => {
    const result = await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(result).toMatchObject({ historyDays: 0, mode: 'learning', payees: 0 });
    expect(await dirtyOf()).toBe(0);
  });

  it('uses the user timezone for days', async () => {
    // 2026-10-21T20:00Z is already Oct 22 in Kolkata (today at 03:00Z = 08:30 IST), still Oct 21 in Los Angeles.
    await markEngineDirty(testDb(), USER_ID);
    await testDb().prepare("UPDATE engine_patterns SET timezone = 'America/Los_Angeles'").run();
    await seedTransaction({ amount: '100', transaction_at: '2026-10-10T12:00:00.000Z' });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await profileOf()).toMatchObject({ timezone: 'America/Los_Angeles', historyDays: 11 });
  });

  it('only reads the given user', async () => {
    await seedUser(OTHER);
    await seedHistory(OTHER);
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    expect(await rowsOf('payee_patterns')).toHaveLength(0);
    expect(await rowsOf('engine_patterns', 'user_id = ?', OTHER)).toHaveLength(0);
  });
});

describe('nightly fan-out', () => {
  const envWith = (queue: FakeQueue) => makeEnv({ ENGINE_QUEUE: queue.asQueue() });
  const queuedBy = async () => {
    const queue = new FakeQueue();
    // The 23rd (IST) is more than a day from every snapshot day, which would queue every active profile (scoring tests).
    await worker.scheduled?.(controller(ENGINE_CRON, NOW + DAY), envWith(queue), ctx);
    return (queue.sent as Array<{ userId: string }>).map((m) => m.userId).sort();
  };
  const addUser = async (id: string, withTransaction = true) => {
    await seedUser(id);
    if (withTransaction) await seedTransaction({ user_id: id });
  };
  const setProfile = (userId: string, dirty: number, computedAt: string) =>
    testDb()
      .prepare("INSERT INTO engine_patterns (user_id, version, history_days, profile, dirty, computed_at) VALUES (?, 1, 0, '{}', ?, ?)")
      .bind(userId, dirty, computedAt)
      .run();

  it('queues dirty and week-old profiles and users with transactions but no profile', async () => {
    const id = (n: number) => `${n}0000000-0000-4000-8000-000000000000`;
    const [FRESH, DIRTY, OLD, NEW, EMPTY, DELETED_ONLY] = [id(1), id(2), id(3), id(4), id(5), id(6)] as [string, string, string, string, string, string];
    for (const user of [FRESH, DIRTY, OLD, NEW]) await addUser(user);
    await addUser(EMPTY, false);
    await addUser(DELETED_ONLY, false);
    await seedTransaction({ user_id: DELETED_ONLY, deleted_at: at(1) });
    await setProfile(FRESH, 0, at(2));
    await setProfile(DIRTY, 1, at(0));
    await setProfile(OLD, 0, at(8));
    // USER_ID (no transactions, no profile), EMPTY and DELETED_ONLY (nothing live) are left out.
    expect(await queuedBy()).toEqual([DIRTY, OLD, NEW].sort());
  });

  it('includes a user whose only activity was a delete (the mark made a stub row)', async () => {
    const id = await seedTransaction();
    await call(`/api/v1/transactions/${id}`, { method: 'DELETE' });
    expect(await queuedBy()).toEqual([USER_ID]);
  });

  it('a finished run takes the user out of the next fan-out', async () => {
    await seedHistory();
    expect(await queuedBy()).toEqual([USER_ID]);
    await runEngineForUser(makeEnv(), USER_ID, Date.now());
    expect(await queuedBy()).toEqual([]);
  });

  it('pages through more users than one page holds', async () => {
    const db = testDb();
    const ids = Array.from({ length: 1203 }, (_, i) => `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`);
    for (let i = 0; i < ids.length; i += 50) {
      await db.batch(
        ids.slice(i, i + 50).flatMap((id) => [
          db.prepare('INSERT INTO users (id, currency, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(id, 'INR', at(1), at(1)),
          db
            .prepare(
              `INSERT INTO transactions (id, user_id, amount, type, transaction_at, created_at, updated_at, payee_key) VALUES (?, ?, 100, 'debit', ?, ?, ?, 'x')`,
            )
            .bind(uid(), id, at(1), at(1), at(1)),
        ]),
      );
    }
    const queue = new FakeQueue();
    const queued = await fanOutEngine({ DB: db, ENGINE_QUEUE: queue.asQueue() }, NOW);
    expect(queued).toBe(1203);
    expect(new Set((queue.sent as Array<{ userId: string }>).map((m) => m.userId)).size).toBe(1203);
  });
});

describe('queue consumer', () => {
  it('builds a user\'s rows and acks', async () => {
    await seedTransaction({ transaction_at: new Date(Date.now() - 5 * DAY).toISOString() });
    const message = new FakeMessage({ userId: USER_ID });
    await worker.queue?.(fakeBatch('dime-engine', [message]), makeEnv(), ctx);
    expect(message.acked).toBe(true);
    expect(await oneRow('engine_patterns', 'user_id = ?', USER_ID)).toMatchObject({ version: 1, dirty: 0 });
  });

  it('acks a malformed message without retrying', async () => {
    const message = new FakeMessage({ nope: true });
    await worker.queue?.(fakeBatch('dime-engine', [message]), makeEnv(), ctx);
    expect(message.acked).toBe(true);
    expect(message.retried).toBeUndefined();
  });

  it('retries a failed user instead of acking it', async () => {
    const message = new FakeMessage({ userId: USER_ID });
    await worker.queue?.(fakeBatch('dime-engine', [message]), makeEnv({ DB: failingOn(/FROM payee_patterns WHERE user_id = \?/) }), ctx);
    expect(message.retried).toEqual({ delaySeconds: 60 });
    expect(message.acked).toBe(false);
  });

  it('the DLQ handler logs and acks without touching data', async () => {
    const message = new FakeMessage({ userId: USER_ID }, 3);
    await worker.queue?.(fakeBatch('dime-engine-dlq', [message]), makeEnv(), ctx);
    expect(message.acked).toBe(true);
    expect(await rowsOf('engine_patterns')).toHaveLength(0);
  });
});
