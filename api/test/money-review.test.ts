import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { purgeOldJobs, purgeStrandedCaptureMedia } from '../src/features/jobs/purge';
import { mediaStore } from '../src/features/media/storage';
import { reconcileUserBudgetAlerts } from '../src/features/notifications/budget-alerts';
import { releaseTransaction } from '../src/features/reminders/service';
import { backfillPayeeKeys } from '../src/features/transactions/backfill';
import { datesCondition, ledgerSelect, periodLedger, windowFilter } from '../src/features/transactions/ledger';
import { USER_ID, call as callApi, makeEnv } from './helpers';
import { oneRow, rowsOf, seedBudget, seedCategory, seedJob, seedPushToken, seedReminder, seedReminderPayment, seedTransaction, seedUser, testDb } from './db';
import { JPEG } from './ingest-fixtures';

/** Review fixes on the money model (deploy-window safety, alerts, ledger, 1.5.0 compatibility, leftovers). */

const noLimit = () => makeEnv({ WRITE_LIMITER: undefined });
const call: typeof callApi = (path, opts = {}, ctx) => callApi(path, { ...opts, env: opts.env ?? noLimit() }, ctx);
const TZ = 'timezone=Asia%2FKolkata';
const FOOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TRAVEL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ITEM = '77777777-7777-4777-8777-777777777777';
const OTHER = '22222222-2222-2222-2222-222222222222';

type Json = Record<string, unknown>;

afterEach(() => vi.useRealTimers());
const setNow = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

/** A raw insert with no kind (column default 'spend'), local_date, month_key or occurrence, like a pre-money-model writer. */
const oldInsert = (over: { id: string; type?: string; counterparty_type?: string; hash?: string | null; item?: string | null }) =>
  testDb()
    .prepare(
      `INSERT INTO transactions (id, user_id, amount, type, detected_via, transaction_at, created_at, updated_at, counterparty_name, counterparty_type, payment_hash, payee_key, recurring_item_id)
       VALUES (?, ?, 10000, ?, 'manual', '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:00.000Z', '2026-10-04T10:00:00.000Z', 'Someone', ?, ?, 'someone', ?)`,
    )
    .bind(over.id, USER_ID, over.type ?? 'debit', over.counterparty_type ?? 'merchant', over.hash ?? null, over.item ?? null)
    .run();

const insertItem = (active = 1, startsOn: string | null = '2026-10-05') =>
  testDb()
    .prepare(
      `INSERT INTO recurring_items (id, user_id, kind, name, amount, cadence, day_of_month, timezone, next_due_date, active, starts_on)
       VALUES (?, ?, 'subscription', 'Netflix', 10000, 'monthly', 5, 'Asia/Kolkata', '2026-11-05', ?, ?)`,
    )
    .bind(ITEM, USER_ID, active, startsOn)
    .run();

describe('kind and occurrence invariants (0019: the deploy-window repair triggers are gone)', () => {
  const kindOf = async (id: string) => (await oneRow<{ kind: string }>('transactions', 'id = ?', id))?.kind;

  it('an insert whose kind does not fit its direction is refused, not repaired; a transfer fits either direction', async () => {
    await expect(oldInsert({ id: 'a0000000-0000-4000-8000-000000000002', type: 'credit' })).rejects.toThrow(/direction/);
    await oldInsert({ id: 'a0000000-0000-4000-8000-000000000001', type: 'debit' });
    expect(await kindOf('a0000000-0000-4000-8000-000000000001')).toBe('spend');
    await seedTransaction({ type: 'credit', kind: 'transfer', counterparty_type: 'self_transfer' });
  });

  it('flipping the type without a fitting kind is refused; flipping both together is fine', async () => {
    const id = await seedTransaction({ type: 'debit' });
    await expect(testDb().prepare("UPDATE transactions SET type = 'credit' WHERE id = ?").bind(id).run()).rejects.toThrow(/direction/);
    await testDb().prepare("UPDATE transactions SET type = 'credit', kind = 'income' WHERE id = ?").bind(id).run();
    expect(await kindOf(id)).toBe('income');
    await expect(testDb().prepare("UPDATE transactions SET kind = 'spend' WHERE id = ?").bind(id).run()).rejects.toThrow(/direction/);
  });

  it('a legacy recurring posting (hash only, no occurrence) still counts as its occurrence for linking and the poster', async () => {
    await insertItem();
    await oldInsert({ id: 'b0000000-0000-4000-8000-000000000003', hash: `recurring:${ITEM}:2026-10-05`, item: ITEM });
    expect(await oneRow('transactions', 'id = ?', 'b0000000-0000-4000-8000-000000000003')).toMatchObject({ recurring_occurrence: null });
    const { listOccurrences } = await import('../src/features/recurring/repository');
    const { findByOccurrence } = await import('../src/features/transactions/repository');
    expect(await listOccurrences(testDb(), USER_ID, ITEM)).toEqual(['2026-10-05']);
    expect((await findByOccurrence(testDb(), USER_ID, ITEM, '2026-10-05'))?.id).toBe('b0000000-0000-4000-8000-000000000003');
  });
});

describe('budget alerts: oscillation does not push again', () => {
  const CAP_MONTH = '2026-10';
  const NOW = Date.parse('2026-10-20T08:00:00Z');
  const pushes: string[] = [];
  const pushSend = (({ title }: { title: string }) => {
    pushes.push(title);
    return Promise.resolve();
  }) as never;
  const reconcile = () => reconcileUserBudgetAlerts(testDb(), USER_ID, [CAP_MONTH], { pushSend, nowMs: NOW });
  const alerts = async () => (await rowsOf<{ dedupe_key: string; read_at: string | null }>('notifications', "dedupe_key LIKE 'budget:%'")).map((n) => ({ key: n.dedupe_key, read: n.read_at !== null }));

  it('delete and restore re-lists the alert silently (read, no push); a different cap pushes again', async () => {
    pushes.length = 0;
    await seedBudget({ monthly: '1000' });
    await seedPushToken('ExponentPushToken[abc]');
    const id = await seedTransaction({ amount: '1200', transaction_at: '2026-10-04T10:00:00.000Z' });
    await reconcile();
    expect(pushes).toHaveLength(1);
    expect(await alerts()).toEqual([{ key: 'budget:monthly:100:2026-10', read: false }]);

    await testDb().prepare("UPDATE transactions SET deleted_at = '2026-10-05T00:00:00.000Z' WHERE id = ?").bind(id).run();
    await reconcile();
    expect(await alerts()).toEqual([]);
    expect((await testDb().prepare('SELECT COUNT(*) AS n FROM budget_alert_marks').first<{ n: number }>())?.n).toBe(1);

    await testDb().prepare('UPDATE transactions SET deleted_at = NULL WHERE id = ?').bind(id).run();
    await reconcile();
    expect(pushes).toHaveLength(1); // the same cap: announced already
    expect(await alerts()).toEqual([{ key: 'budget:monthly:100:2026-10', read: true }]);
    await reconcile();
    expect(pushes).toHaveLength(1);

    // The cap changed (raised, then lowered back to a different value): that is news.
    await testDb().prepare("UPDATE budget_history SET amount_cents = 2000000 WHERE scope = 'monthly'").run();
    await reconcile();
    expect(await alerts()).toEqual([]);
    await testDb().prepare("UPDATE budget_history SET amount_cents = 50000 WHERE scope = 'monthly'").run();
    await reconcile();
    expect(pushes).toHaveLength(2);
  });

  it('two concurrent reconciles raise the alert once and push once', async () => {
    pushes.length = 0;
    await seedBudget({ monthly: '1000' });
    await seedPushToken('ExponentPushToken[abc]');
    await seedTransaction({ amount: '1200', transaction_at: '2026-10-04T10:00:00.000Z' });
    await Promise.all([reconcile(), reconcile()]);
    expect(await alerts()).toHaveLength(1);
    expect(pushes).toHaveLength(1);
  });
});

describe('ledger', () => {
  it('the date window is index-friendly: the plan searches local_date_idx and looks transactions up by id', async () => {
    const f = windowFilter(USER_ID, { dates: { from: '2026-10-01', to: '2026-10-31' } });
    const rows = await testDb()
      .prepare(`EXPLAIN QUERY PLAN WITH ledger AS (${ledgerSelect(f.sql)}) SELECT l.category_id, SUM(l.spend_cents) FROM ledger l GROUP BY l.category_id`)
      .bind(...f.params)
      .all<{ detail: string }>();
    const plan = rows.results.map((r) => r.detail).join('\n');
    expect(plan).toContain('transactions_user_local_date_idx (user_id=? AND local_date>? AND local_date<?)');
    expect(plan).toContain('transactions_user_at_idx');
    expect(plan).toContain('SEARCH t USING INDEX sqlite_autoindex_transactions_1 (id=?)');
    expect(plan).not.toMatch(/SCAN t/);
    expect(plan).not.toContain('SEARCH t USING INDEX transactions_user_dupe_idx');
  });

  it('the date window still places rows without a local date by their IST instant, and leaves other users out', async () => {
    await seedTransaction({ amount: '10', local_date: null, transaction_at: '2026-10-04T10:00:00.000Z' });
    await seedTransaction({ amount: '20', local_date: '2026-10-05' });
    await seedTransaction({ amount: '40', local_date: '2026-11-01' });
    const l = await periodLedger(testDb(), USER_ID, { dates: { from: '2026-10-01', to: '2026-10-31' } });
    expect(l.spendCents).toBe(3000);
    // Another user's rows in the same window are not counted.
    await seedUser(OTHER);
    await seedTransaction({ user_id: OTHER, amount: '999', local_date: '2026-10-05' });
    expect((await periodLedger(testDb(), USER_ID, { dates: { from: '2026-10-01', to: '2026-10-31' } })).spendCents).toBe(3000);
    expect(datesCondition({ from: '2026-10-01', to: '2026-10-31' }, { sql: 'u.id', params: [] }).sql).toContain('w.user_id = u.id');
  });

  it('effective amounts never go below zero when links exceed an amount; restoring a row drops the links that no longer fit', async () => {
    setNow('2026-10-20T08:00:00Z');
    const hotel = await seedTransaction({ amount: '100' });
    const friend = await seedTransaction({ type: 'credit', amount: '100', counterparty_name: 'Ravi' });
    const link = await call('/api/v1/transactions/offsets', { method: 'POST', json: { credit_id: friend, debit_id: hotel, amount: '100' } });
    expect(link.status).toBe(201);
    // The friend's credit is deleted, the hotel bill edited down, then the credit restored: 100 of links on a 50 bill.
    expect((await call(`/api/v1/transactions/${friend}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`/api/v1/transactions/${hotel}`, { method: 'PATCH', json: { amount: '50' } })).status).toBe(200);
    expect((await call(`/api/v1/transactions/${friend}/restore`, { method: 'POST' })).status).toBe(200);
    expect(await rowsOf('transaction_offsets')).toHaveLength(0);
    const l = await periodLedger(testDb(), USER_ID, { dates: { from: '2026-10-01', to: '2026-10-31' } });
    expect(l.spendCents).toBe(5000);

    // Raw overfull links (an older client, a race) are clamped by the ledger.
    await testDb()
      .prepare('INSERT INTO transaction_offsets (id, user_id, credit_id, debit_id, amount) VALUES (?, ?, ?, ?, ?)')
      .bind('cc000000-0000-4000-8000-000000000001', USER_ID, friend, hotel, 9000)
      .run();
    const clamped = await periodLedger(testDb(), USER_ID, { dates: { from: '2026-10-01', to: '2026-10-31' } });
    expect(clamped.spendCents).toBeGreaterThanOrEqual(0);
    expect(clamped.spendCents).toBe(0);
  });

  it('a total is the sum of its floored categories: a category with more refunds than spend takes nothing off another', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await seedCategory({ id: TRAVEL, name: 'Travel', user_id: USER_ID });
    await seedTransaction({ amount: '100', category_id: FOOD });
    await seedTransaction({ type: 'credit', kind: 'payback', amount: '150', category_id: TRAVEL, counterparty_name: 'Airline refund' });
    const l = await periodLedger(testDb(), USER_ID, { dates: { from: '2026-10-01', to: '2026-10-31' } });
    expect(l.spendByCategory.get(FOOD)).toBe(10000);
    expect(l.spendByCategory.get(TRAVEL)).toBe(0);
    expect(l.spendCents).toBe([...l.spendByCategory.values()].reduce((a, b) => a + b, 0));
    expect(l.spendCents).toBe(10000);
    expect(l.budgetSpendCents).toBe(10000);
  });
});

describe('1.5.0 app compatibility', () => {
  const post = (json: Json) => call(`/api/v1/transactions?${TZ}`, { method: 'POST', json: { type: 'debit', counterparty_name: 'Tea', transaction_at: '2026-10-04T10:00:00+05:30', ...json } });

  it('float noise in an amount is rounded to the cent; a real third decimal is still refused', async () => {
    const res = await post({ amount: 100.30000000000001 });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ transaction: { amount: '100.30' } });
    expect((await post({ amount: '100.30000000000001' })).status).toBe(201);
    expect((await post({ amount: 0.1 + 0.2 })).status).toBe(201); // 0.30000000000000004
    expect((await post({ amount: 12.505 })).status).toBe(422);
    expect((await post({ amount: '12.505' })).status).toBe(422);
    expect((await post({ amount: '12.5049' })).status).toBe(422);
  });

  it('PATCH with the stored (future) time echoed back is accepted; moving it far ahead is not; creating a day ahead is', async () => {
    setNow('2026-10-20T08:00:00Z');
    const id = await seedTransaction({ transaction_at: '2026-10-30T10:00:00.000Z', amount: '480' });
    const stored = '2026-10-30T10:00:00.000Z';
    expect((await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: { note: 'bill', transaction_at: stored } })).status).toBe(200);
    expect((await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: { note: 'bill', transaction_at: '2026-10-30T10:00:00+00:00' } })).status).toBe(200);
    expect((await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: { transaction_at: '2026-11-15T10:00:00.000Z' } })).status).toBe(422);
    expect((await post({ amount: '10', transaction_at: '2026-10-21T20:00:00Z' })).status).toBe(201); // 36 h ahead: clock skew, fine
  });

  it('DELETE without expected_updated_at is 204; an old full-body PATCH with unchanged values is 200', async () => {
    const id = await seedTransaction({ amount: '480', counterparty_name: 'Swiggy', transaction_at: '2026-10-04T10:00:00.000Z' });
    const full = { amount: '480.00', type: 'debit', counterparty_name: 'Swiggy', counterparty_type: 'merchant', category: null, note: null, transaction_at: '2026-10-04T10:00:00.000Z' };
    const patched = await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: full });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ amount: '480.00', kind: 'spend' });
    expect((await call(`/api/v1/transactions/${id}`, { method: 'DELETE' })).status).toBe(204);
  });
});

describe('recurring: linking', () => {
  const link = (transaction_id: string, occurrence = '2026-10-05') => call(`/api/v1/recurring/${ITEM}/link`, { method: 'POST', json: { transaction_id, occurrence } });

  it('a paused item cannot be linked to (400, not 500)', async () => {
    await insertItem(0);
    const tx = await seedTransaction({ amount: '100', transaction_at: '2026-10-05T10:00:00.000Z' });
    expect((await link(tx)).status).toBe(400);
    expect(await oneRow('transactions', 'id = ?', tx)).toMatchObject({ recurring_item_id: null });
  });

  it('an item with no starts_on (a row from before the column) still links and re-plans', async () => {
    await insertItem(1, null);
    await testDb().prepare('UPDATE recurring_items SET starts_on = NULL WHERE id = ?').bind(ITEM).run();
    const tx = await seedTransaction({ amount: '100', transaction_at: '2026-10-05T10:00:00.000Z' });
    expect((await link(tx)).status).toBe(200);
    expect(await oneRow('transactions', 'id = ?', tx)).toMatchObject({ recurring_item_id: ITEM, recurring_occurrence: '2026-10-05' });
  });
});

describe('reminders: an amount-less repeating reminder reopens from its payment rows', () => {
  it('deleting the payment of an earlier occurrence reopens it even though completed_txn_id names the later one', async () => {
    const jan = await seedTransaction({ amount: '100' });
    const feb = await seedTransaction({ amount: '100' });
    const reminder = await seedReminder({ amount: null, cadence: 'monthly', due_date: '2027-03-10', anchor_day: 10, completed_txn_id: feb });
    await seedReminderPayment({ reminder_id: reminder, txn_id: jan, cents: 10000, due: '2027-01-10' });
    await seedReminderPayment({ reminder_id: reminder, txn_id: feb, cents: 10000, due: '2027-02-10' });
    await releaseTransaction(testDb(), USER_ID, jan, Date.parse('2027-02-20T08:00:00Z'));
    expect(await oneRow('reminders', 'id = ?', reminder)).toMatchObject({ status: 'open', due_date: '2027-01-10', completed_txn_id: null });
    expect(await rowsOf('reminder_payments')).toHaveLength(1);
  });

  it('a payment migrated with an empty occurrence is just withdrawn: nothing reopens', async () => {
    const t = await seedTransaction({ amount: '100' });
    const reminder = await seedReminder({ amount: null, cadence: 'monthly', due_date: '2027-03-10', anchor_day: 10 });
    await seedReminderPayment({ reminder_id: reminder, txn_id: t, cents: 10000, due: '' });
    await releaseTransaction(testDb(), USER_ID, t, Date.parse('2027-02-20T08:00:00Z'));
    expect(await oneRow('reminders', 'id = ?', reminder)).toMatchObject({ status: 'open', due_date: '2027-03-10' });
    expect(await rowsOf('reminder_payments')).toHaveLength(0);
  });
});

describe('leftovers', () => {
  it('the backfill gives a Tamil payee a real key; a name with no letters stays unknown; updated_at is untouched', async () => {
    const tamil = await seedTransaction({ counterparty_name: 'சரவணா ஸ்டோர்ஸ்', counterparty_normalized: null });
    const symbols = await seedTransaction({ counterparty_name: '???', counterparty_normalized: null });
    const empty = await seedTransaction({ counterparty_name: '', counterparty_normalized: null });
    await testDb().prepare("UPDATE transactions SET payee_key = 'unknown'").run();
    const before = await oneRow<{ updated_at: string }>('transactions', 'id = ?', tamil);
    expect(await backfillPayeeKeys(testDb())).toBe(1);
    expect(await oneRow('transactions', 'id = ?', tamil)).toMatchObject({ payee_key: 'சரவணா ஸ்டோர்ஸ்', counterparty_normalized: 'சரவணா ஸ்டோர்ஸ்', updated_at: before?.updated_at });
    expect(await oneRow('transactions', 'id = ?', symbols)).toMatchObject({ payee_key: 'unknown' });
    expect(await oneRow('transactions', 'id = ?', empty)).toMatchObject({ payee_key: 'unknown' });
    expect(await backfillPayeeKeys(testDb())).toBe(0);
  });

  describe('stranded capture media', () => {
    const NOW = Date.parse('2026-10-04T12:00:00.000Z');
    const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
    const keys = async () => (await workerEnv.MEDIA.list()).objects.map((o) => o.key).sort();
    const review = { needs_review: true, reason: 'foreign_currency', currency: 'USD', amount: '12.50', counterparty_name: 'Starbucks' };

    it('a foreign-currency capture in review for 30 days loses its upload and its job; a younger one and a posted one stay', async () => {
      await workerEnv.MEDIA.put('receipts/u/old.jpg', JPEG);
      await workerEnv.MEDIA.put('receipts/u/young.jpg', JPEG);
      await workerEnv.MEDIA.put('receipts/u/posted.jpg', JPEG);
      const old = await seedJob({ status: 'done', result: review, payload: { object_path: 'receipts/u/old.jpg' }, updated_at: ago(31) });
      const young = await seedJob({ status: 'done', result: review, payload: { object_path: 'receipts/u/young.jpg' }, updated_at: ago(10) });
      const posted = await seedJob({ status: 'done', result: { transaction_id: 'x' }, payload: { object_path: 'receipts/u/posted.jpg' }, updated_at: ago(31) });
      await purgeOldJobs(testDb(), NOW, mediaStore(makeEnv()));
      expect(await keys()).toEqual(['receipts/u/posted.jpg', 'receipts/u/young.jpg']);
      const left = (await rowsOf<{ id: string }>('jobs')).map((r) => r.id);
      expect(left).toContain(young);
      expect(left).not.toContain(old);
      expect(left).not.toContain(posted); // a finished job is history after 30 days either way
    });

    it('a job whose upload cannot be deleted is kept for the next hour', async () => {
      await workerEnv.MEDIA.put('receipts/u/old.jpg', JPEG);
      const id = await seedJob({ status: 'failed', payload: { object_path: 'receipts/u/old.jpg' }, updated_at: ago(31) });
      const broken = { bucket: { delete: () => Promise.reject(new Error('r2 down')) } } as unknown as ReturnType<typeof mediaStore>;
      expect(await purgeStrandedCaptureMedia(testDb(), broken, NOW)).toBe(0);
      expect(await purgeOldJobs(testDb(), NOW, broken)).toBe(0);
      expect(await oneRow('jobs', 'id = ?', id)).not.toBeNull();
      expect(await purgeStrandedCaptureMedia(testDb(), mediaStore(makeEnv()), NOW)).toBe(1);
      expect(await keys()).toEqual([]);
    });
  });
});
