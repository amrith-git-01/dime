import { describe, expect, it } from 'vitest';

import { isTransientDbError, isUniqueViolation } from '../src/core/db-errors';
import { claimJob, claimKey, failIfUnfinished, findByKeys, insertMany, listRecoverable, markDone, releaseJob, requeueStaleProcessing } from '../src/features/jobs/repository';
import { fetchActive, findByPaymentHash, insertTransactionRow, payeeTotals, periodSummary, softDelete, updateForUser } from '../src/features/transactions/repository';
import { insertDefaults } from '../src/features/user-settings/repository';
import { USER_ID } from './helpers';
import { oneRow, rowsOf, seedCategory, seedJob, seedTransaction, seedUser, testDb } from './db';

const OTHER = '33333333-3333-3333-3333-333333333333';
const JOB = 'aaaaaaaa-0000-0000-0000-00000000000a';

describe('migration 0001: seed and constraints', () => {
  it('seeds the ten spending system categories with their production ids', async () => {
    const rows = await rowsOf<{ id: string; name: string; icon_name: string; color: string; is_system: number; user_id: string | null; created_at: string }>(
      'categories',
      "is_system = 1 AND scope = 'spend'",
    );
    expect(rows.map((r) => [r.id, r.name, r.icon_name, r.color])).toEqual([
      ['ad296c59-42ec-49e5-b824-c011c5b1b28b', 'Bills & Utilities', 'Zap', '#FBBF24'],
      ['e7d18795-d02a-4350-9553-5573cc45aa28', 'Education', 'GraduationCap', '#F472B6'],
      ['9a4d0ec2-15af-4162-ae1e-bc2b738ca33b', 'Entertainment', 'Clapperboard', '#FB923C'],
      ['85bf877a-f8b1-4b07-a9fb-5e8c809907ae', 'Food & Dining', 'UtensilsCrossed', '#FF6B6B'],
      ['a00eb2e0-48a8-47f1-98cb-3a30b8731501', 'Health', 'HeartPulse', '#4ADE80'],
      ['2aedfd2c-7a2d-48e9-9b9c-8918dd4e9715', 'Income', 'TrendingUp', '#34D399'],
      ['cec86c98-e09e-4a7a-afb0-05f66b17a94b', 'Other', 'Package', '#94A3B8'],
      ['a50ff903-ea00-404a-a3a4-d99c96899de5', 'Shopping', 'ShoppingBag', '#A855F7'],
      ['533e41b7-e8cf-42bc-95db-35b793b9f1f4', 'Transport', 'Car', '#4ECDC4'],
      ['be46f4f5-efa9-4ad9-b09c-ca24a088e7f7', 'Travel', 'Plane', '#818CF8'],
    ]);
    expect(rows.every((r) => r.user_id === null && r.created_at === '2026-06-11T17:30:06.824Z')).toBe(true);
  });

  it('seeds the recurring system categories (migration 0007) with their scope', async () => {
    const names = async (scope: string) =>
      (await rowsOf<{ name: string }>('categories', 'is_system = 1 AND scope = ?', scope)).map((r) => r.name).sort();
    expect(await names('recurring_expense')).toEqual([
      'EMI & loans', 'Fees & tuition', 'Insurance', 'Internet & phone', 'Investments & SIP', 'Other expense', 'Rent', 'Subscriptions', 'Utilities',
    ]);
    expect(await names('recurring_income')).toEqual(['Allowance', 'Freelance', 'Interest & dividends', 'Other income', 'Rental income', 'Salary']);
    const bad = await testDb().prepare("INSERT INTO categories (id, name, is_system, scope) VALUES ('x', 'X', 0, 'nope')").run().then(() => false, () => true);
    expect(bad).toBe(true);
  });

  it('category names are unique per user, case-insensitively (categories_user_name_uniq), not across users (0004)', async () => {
    await seedUser(OTHER);
    await seedCategory({ name: 'Coffee' });
    const err = await seedCategory({ user_id: USER_ID, name: 'COFFEE' }).catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
    // Another user may use the same name; clashes with system names are refused by the service (409), not the database.
    await seedCategory({ user_id: OTHER, name: 'coffee' });
  });

  it('deleting a user cascades to everything they own', async () => {
    const tx = await seedTransaction({});
    await seedCategory({ name: 'Mine' });
    await testDb().prepare('INSERT INTO budgets (id, user_id, monthly_budget) VALUES (?, ?, 5)').bind('b', USER_ID).run();
    await testDb().prepare("INSERT INTO notifications (id, user_id, kind, title, body, action_transaction_id, dedupe_key) VALUES ('n', ?, 'transaction_auto', 't', 'b', ?, 'k')").bind(USER_ID, tx).run();
    await testDb().prepare('DELETE FROM users WHERE id = ?').bind(USER_ID).run();
    for (const table of ['transactions', 'budgets', 'notifications']) expect(await rowsOf(table), table).toHaveLength(0);
    expect(await rowsOf('categories', 'is_system = 0')).toHaveLength(0);
    expect(await rowsOf('categories', 'is_system = 1')).toHaveLength(25);
  });

  it('keeps the CHECK constraints', async () => {
    const bad = (sql: string, ...params: (string | number | null)[]) => testDb().prepare(sql).bind(...params).run().then(() => false, () => true);
    expect(await bad("INSERT INTO budgets (id, user_id, monthly_budget) VALUES ('x', ?, -1)", USER_ID)).toBe(true);
    expect(await bad("INSERT INTO user_push_tokens (id, user_id, expo_push_token, platform) VALUES ('x', ?, 'tok', 'ios')", USER_ID)).toBe(true);
    expect(await bad("INSERT INTO user_feedback (id, user_id, message, feedback_type) VALUES ('x', ?, 'm', 'rant')", USER_ID)).toBe(true);
    expect(await bad("INSERT INTO agent_feedback (id, user_id, turn_id, rating) VALUES ('x', ?, 't', 'meh')", USER_ID)).toBe(true);
    expect(await bad("INSERT INTO agent_feedback (id, user_id, turn_id, rating, comment) VALUES ('x', ?, 't', 'up', ?)", USER_ID, 'c'.repeat(1001))).toBe(true);
    expect(await bad("INSERT INTO agent_feedback (id, user_id, turn_id, rating, comment) VALUES ('x', ?, 't', 'up', ?)", USER_ID, 'c'.repeat(1000))).toBe(false);
    expect(await bad("INSERT INTO user_settings (user_id, daily_expense_reminder_time) VALUES (?, '24:00')", USER_ID)).toBe(true);
    expect(await bad("INSERT INTO user_settings (user_id, daily_expense_reminder_time) VALUES (?, '23:59')", USER_ID)).toBe(false);
    expect(await bad("INSERT INTO email_sends (id, user_id, kind, period_key) VALUES ('x', ?, 'daily', 'k')", USER_ID)).toBe(true);
    expect(await bad("INSERT INTO jobs (id, user_id, kind, status) VALUES ('x', ?, 'receipt', 'weird')", USER_ID)).toBe(true);
  });
});

/** The id of the stored row. */
const insertTransaction = async (db: Parameters<typeof insertTransactionRow>[0], row: Parameters<typeof insertTransactionRow>[1]) => (await insertTransactionRow(db, row)).id;

describe('transactions: partial unique payment_hash and payee_key', () => {
  const row = (over: Partial<Parameters<typeof insertTransactionRow>[1]> = {}) => ({
    user_id: USER_ID,
    amount: '10.50',
    type: 'debit',
    note: null,
    detected_via: 'manual',
    transaction_at: '2026-10-04T10:00:00.000Z',
    category_id: null,
    receipt_url: null,
    voice_url: null,
    counterparty_name: 'Swiggy',
    counterparty_normalized: 'swiggy',
    payment_hash: 'hash-1',
    ...over,
  });

  it('a second active row with the same (user, payment_hash) is a unique violation', async () => {
    await insertTransaction(testDb(), row());
    const err = await insertTransaction(testDb(), row()).catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
    expect(await rowsOf('transactions')).toHaveLength(1);
  });

  it('a soft-deleted row does not block the same hash, and neither does another user', async () => {
    const first = await insertTransaction(testDb(), row());
    expect(await softDelete(testDb(), USER_ID, first)).toBe(true);
    await insertTransaction(testDb(), row());
    expect(await rowsOf('transactions')).toHaveLength(2);
    await seedUser(OTHER);
    await insertTransaction(testDb(), row({ user_id: OTHER }));
    expect(await rowsOf('transactions')).toHaveLength(3);
    // Rows without a hash never clash.
    await seedTransaction({ payment_hash: null });
    await seedTransaction({ payment_hash: null });
  });

  it('updating onto an existing hash is a unique violation too', async () => {
    await insertTransaction(testDb(), row());
    const second = await insertTransaction(testDb(), row({ payment_hash: 'hash-2' }));
    const err = await updateForUser(testDb(), USER_ID, second, { payment_hash: 'hash-1' }).catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
    expect((await fetchActive(testDb(), USER_ID, second))?.payment_hash).toBe('hash-2');
  });

  it('computes payee_key on insert and recomputes it when the payee changes', async () => {
    const a = await insertTransaction(testDb(), row({ counterparty_name: ' Swiggy ', counterparty_normalized: 'swiggy', payment_hash: 'a' }));
    const b = await insertTransaction(testDb(), row({ counterparty_name: "McDonald's (Andheri)!", counterparty_normalized: null, payment_hash: 'b' }));
    const c = await insertTransaction(testDb(), row({ counterparty_name: '***', counterparty_normalized: null, payment_hash: 'c' }));
    const keys = async () => Object.fromEntries((await rowsOf<{ id: string; payee_key: string }>('transactions')).map((r) => [r.id, r.payee_key]));
    expect(await keys()).toEqual({ [a]: 'swiggy', [b]: 'mcdonald s andheri', [c]: 'unknown' });

    await updateForUser(testDb(), USER_ID, a, { counterparty_name: 'Zomato Ltd', counterparty_normalized: 'zomato ltd' });
    expect((await keys())[a]).toBe('zomato ltd');
    // An update that leaves the payee alone keeps the key.
    await updateForUser(testDb(), USER_ID, a, { note: 'x' });
    expect((await keys())[a]).toBe('zomato ltd');
    expect((await oneRow<{ updated_at: string }>('transactions', 'id = ?', a))?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  });

  it('stores money as integer cents and returns decimal strings', async () => {
    const id = await insertTransaction(testDb(), row({ amount: '0.05' }));
    expect((await oneRow<{ amount: number }>('transactions', 'id = ?', id))?.amount).toBe(5);
    expect((await findByPaymentHash(testDb(), USER_ID, 'hash-1'))?.amount).toBe('0.05');
  });

  it('periodSummary and payeeTotals aggregate in SQL over the half-open range', async () => {
    await seedCategory({ id: 'cccccccc-0000-0000-0000-000000000001', name: 'Eats' });
    const eats = 'cccccccc-0000-0000-0000-000000000001';
    const at = (d: string) => `2026-10-${d}T10:00:00.000Z`;
    await seedTransaction({ amount: '10.10', type: 'debit', counterparty_name: 'Swiggy', category_id: eats, transaction_at: at('01') });
    await seedTransaction({ amount: '5.05', type: 'debit', counterparty_name: 'SWIGGY', counterparty_normalized: 'swiggy', transaction_at: at('02') });
    await seedTransaction({ amount: '20', type: 'credit', counterparty_name: 'Boss', transaction_at: at('03') });
    await seedTransaction({ amount: '99', type: 'debit', counterparty_name: 'Out', transaction_at: '2026-11-01T00:00:00.000Z' }); // exclusive end
    await seedTransaction({ amount: '99', type: 'debit', counterparty_name: 'Gone', transaction_at: at('04'), deleted_at: at('05') });
    const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };

    const summary = await periodSummary(testDb(), USER_ID, range);
    expect(summary).toMatchObject({ creditCents: 2000, debitCents: 1515, count: 3 });
    expect(Object.fromEntries(summary.debitByCategory)).toEqual({ [eats]: 1010, '': 505 });

    expect(await payeeTotals(testDb(), USER_ID, range)).toEqual([
      { type: 'credit', payee_key: 'boss', display_name: 'Boss', total_cents: 2000, count: 1 },
      // The oldest named row gives the display name.
      { type: 'debit', payee_key: 'swiggy', display_name: 'Swiggy', total_cents: 1515, count: 2 },
    ]);
  });
});

describe('jobs: compare-and-set paths', () => {
  it('claimJob: the first claim wins, a second claim of the same job gets nothing', async () => {
    await seedJob({ id: JOB });
    const results = await Promise.all([claimJob(testDb(), JOB, 3), claimJob(testDb(), JOB, 3)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await oneRow('jobs', 'id = ?', JOB)).toMatchObject({ status: 'processing', attempts: 1 });
    expect(await claimJob(testDb(), JOB, 3)).toBeNull();
    expect(await oneRow('jobs', 'id = ?', JOB)).toMatchObject({ attempts: 1 });
  });

  it('claimJob: increments attempts in SQL and parses payload / result', async () => {
    await seedJob({ id: JOB, payload: { a: [1, 2] }, attempts: 1 });
    const claimed = await claimJob(testDb(), JOB, 3);
    expect(claimed).toMatchObject({ id: JOB, status: 'processing', attempts: 2, payload: { a: [1, 2] }, result: null });
    await markDone(testDb(), JOB, { transaction_id: 't1' });
    expect(await findByKeys(testDb(), USER_ID, ['nope'])).toEqual([]);
    expect(await oneRow('jobs', 'id = ?', JOB)).toMatchObject({ status: 'done', result: '{"transaction_id":"t1"}' });
  });

  it('claimJob: a spent job is failed and not claimed; unknown or non-pending jobs are ignored', async () => {
    await seedJob({ id: JOB, attempts: 3 });
    expect(await claimJob(testDb(), JOB, 3)).toBeNull();
    expect(await oneRow('jobs', 'id = ?', JOB)).toMatchObject({ status: 'failed', last_error: 'max attempts exceeded' });
    expect(await claimJob(testDb(), 'missing', 3)).toBeNull();
  });

  it('releaseJob hands a job back to pending, backdated so recovery sees it', async () => {
    await seedJob({ id: JOB, status: 'processing', updated_at: '2026-10-04T10:00:00.000Z' });
    await releaseJob(testDb(), JOB);
    const row = await oneRow<{ status: string; updated_at: string }>('jobs', 'id = ?', JOB);
    expect(row?.status).toBe('pending');
    expect(Date.now() - Date.parse(row?.updated_at ?? '')).toBeGreaterThanOrEqual(1000);
    // Finished jobs are never reopened.
    await testDb().prepare("UPDATE jobs SET status = 'done'").run();
    await releaseJob(testDb(), JOB);
    expect(await oneRow('jobs', 'id = ?', JOB)).toMatchObject({ status: 'done' });
  });

  it('failIfUnfinished only fails pending / processing jobs and reports which it failed', async () => {
    await seedJob({ id: JOB, status: 'processing', kind: 'receipt' });
    expect(await failIfUnfinished(testDb(), JOB, 'x'.repeat(600))).toEqual({ id: JOB, user_id: USER_ID, kind: 'receipt' });
    expect((await oneRow<{ last_error: string }>('jobs', 'id = ?', JOB))?.last_error).toHaveLength(500);
    expect(await failIfUnfinished(testDb(), JOB, 'again')).toBeNull();
    await testDb().prepare("UPDATE jobs SET status = 'done'").run();
    expect(await failIfUnfinished(testDb(), JOB, 'late')).toBeNull();
    expect(await oneRow('jobs', 'id = ?', JOB)).toMatchObject({ status: 'done' });
  });

  it('requeueStaleProcessing is a conditional update: fresh or non-processing rows stay', async () => {
    const cutoff = '2026-10-04T10:00:00.000Z';
    await seedJob({ id: JOB, status: 'processing', updated_at: '2026-10-04T09:00:00.000Z' });
    await seedJob({ id: 'fresh', status: 'processing', updated_at: '2026-10-04T10:30:00.000Z' });
    await seedJob({ id: 'pending', status: 'pending', updated_at: '2026-10-04T09:00:00.000Z' });
    expect(await requeueStaleProcessing(testDb(), JOB, cutoff)).toBe(true);
    expect(await requeueStaleProcessing(testDb(), JOB, cutoff)).toBe(false); // already pending now
    expect(await requeueStaleProcessing(testDb(), 'fresh', cutoff)).toBe(false);
    expect(await requeueStaleProcessing(testDb(), 'pending', cutoff)).toBe(false);
    expect(await oneRow('jobs', 'id = ?', 'fresh')).toMatchObject({ status: 'processing' });
  });

  it('listRecoverable returns pending / processing jobs of one kind, oldest first', async () => {
    await seedJob({ id: 'b', kind: 'receipt', status: 'pending', updated_at: '2026-10-04T09:30:00.000Z' });
    await seedJob({ id: 'a', kind: 'receipt', status: 'processing', updated_at: '2026-10-04T09:00:00.000Z' });
    await seedJob({ id: 'c', kind: 'voice', status: 'pending', updated_at: '2026-10-04T09:00:00.000Z' });
    await seedJob({ id: 'd', kind: 'receipt', status: 'done', updated_at: '2026-10-04T09:00:00.000Z' });
    await seedJob({ id: 'e', kind: 'receipt', status: 'pending', updated_at: '2026-10-04T11:00:00.000Z' });
    const rows = await listRecoverable(testDb(), { kind: 'receipt', cutoffIso: '2026-10-04T10:00:00.000Z', limit: 10 });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect((await listRecoverable(testDb(), { kind: 'receipt', cutoffIso: '2026-10-04T10:00:00.000Z', limit: 1 })).map((r) => r.id)).toEqual(['a']);
  });

  it('insertMany is atomic: a unique violation anywhere in the batch writes nothing', async () => {
    const job = (key: string | null) => ({ user_id: USER_ID, kind: 'receipt' as const, payload: { n: 1 }, idempotency_key: key });
    const err = await insertMany(testDb(), [job('k:0'), job('k:1'), job('k:0')]).catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
    expect(await rowsOf('jobs')).toHaveLength(0);
    // Rows without a key never clash; the same key for another user is fine.
    await seedUser(OTHER);
    const inserted = await insertMany(testDb(), [job(null), job(null), { ...job('k:0'), user_id: OTHER }, job('k:0')]);
    expect(inserted).toHaveLength(4);
    expect(inserted[0]).toMatchObject({ status: 'pending', attempts: 0, payload: { n: 1 }, result: null });
  });

  it('claimKey: new, in_progress, retry (failed), replay (done), and stale processing re-claim', async () => {
    const claim = (staleAfterSeconds?: number) => claimKey(testDb(), { userId: USER_ID, kind: 'manual_create', key: 'idem-key-1', ...(staleAfterSeconds === undefined ? {} : { staleAfterSeconds }) });
    const first = await claim();
    expect(first.state).toBe('new');
    expect(first.row).toMatchObject({ status: 'processing', attempts: 1, idempotency_key: 'idem-key-1' });

    expect((await claim()).state).toBe('in_progress');

    await testDb().prepare("UPDATE jobs SET status = 'failed'").run();
    const retry = await claim();
    expect(retry.state).toBe('retry');
    expect(retry.row).toMatchObject({ status: 'processing' });

    // processing + stale: re-claimed only once older than the threshold.
    expect((await claim()).state).toBe('in_progress');
    await testDb().prepare("UPDATE jobs SET updated_at = '2026-01-01T00:00:00.000Z'").run();
    expect((await claim(600)).state).toBe('retry');

    await markDone(testDb(), String(first.row.id), { status_code: 201, body: { accepted: true } });
    const replay = await claim();
    expect(replay.state).toBe('replay');
    expect(replay.row.result).toEqual({ status_code: 201, body: { accepted: true } });
  });

  it('claimKey: of two concurrent first claims exactly one is new', async () => {
    const claim = () => claimKey(testDb(), { userId: USER_ID, kind: 'manual_create', key: 'idem-key-2' });
    const states = (await Promise.all([claim(), claim()])).map((r) => r.state).sort();
    expect(states).toEqual(['in_progress', 'new']);
  });
});

describe('user_settings insert-or-ignore', () => {
  it('the first insert returns the row, a racing second one returns null and changes nothing', async () => {
    const first = await insertDefaults(testDb(), USER_ID, { budget_monthly_warn_pct: 70, weekly_email_enabled: false });
    expect(first).toMatchObject({ budget_monthly_warn_pct: 70, weekly_email_enabled: false, budget_alerts_enabled: true, daily_expense_reminder_time: '20:00' });
    expect(await insertDefaults(testDb(), USER_ID, { budget_monthly_warn_pct: 90 })).toBeNull();
    expect(await oneRow('user_settings', 'user_id = ?', USER_ID)).toMatchObject({ budget_monthly_warn_pct: 70, weekly_email_enabled: 0 });
  });

  it('stores card_layouts as NULL by default and as the given JSON when passed', async () => {
    await insertDefaults(testDb(), USER_ID);
    expect(await oneRow('user_settings', 'user_id = ?', USER_ID)).toMatchObject({ card_layouts: null });
    await testDb().prepare('DELETE FROM user_settings').run();
    const row = await insertDefaults(testDb(), USER_ID, { card_layouts: '{"home":["home.stats"]}' });
    expect(row).toMatchObject({ card_layouts: '{"home":["home.stats"]}' });
  });
});

describe('db-errors', () => {
  it('recognises SQLite unique violations (also through a cause) and nothing else', () => {
    expect(isUniqueViolation(new Error('D1_ERROR: UNIQUE constraint failed: jobs.user_id, jobs.idempotency_key: SQLITE_CONSTRAINT'))).toBe(true);
    expect(isUniqueViolation(new Error('D1_ERROR: UNIQUE constraint failed: index \'categories_name_uniq\''))).toBe(true);
    expect(isUniqueViolation(new Error('failed', { cause: new Error('UNIQUE constraint failed: x.y') }))).toBe(true);
    expect(isUniqueViolation(new Error('D1_ERROR: FOREIGN KEY constraint failed'))).toBe(false);
    expect(isUniqueViolation(new Error('D1_ERROR: CHECK constraint failed: amount > 0'))).toBe(false);
    expect(isUniqueViolation('UNIQUE constraint failed')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('classifies transient D1 errors', () => {
    expect(isTransientDbError(new Error('D1_ERROR: Network connection lost.'))).toBe(true);
    expect(isTransientDbError(new Error('D1 DB is overloaded. Requests queued for too long.'))).toBe(true);
    expect(isTransientDbError(new Error('D1_ERROR: no such column: x'))).toBe(false);
    expect(isTransientDbError(new Error('D1_ERROR: UNIQUE constraint failed: a.b'))).toBe(false);
  });
});
