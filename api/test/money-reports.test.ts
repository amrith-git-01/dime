import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildDigestPayload } from '../src/features/email/digest-payload';
import type { ReportSnapshot } from '../src/features/reports/schemas';
import { buildReport } from '../src/features/reports/service';
import { USER_ID, oneRow, seedCategory, seedSettings, seedTransaction, testDb } from './db';

/**
 * The Broke Report and the email digest read the same ledger as the app (docs/MONEY-MODEL-FIX-PLAN.md R2): rent and other fixed
 * money, transfers and refunds do not make a "splurge", paybacks lower what a spend really cost, and the month is the user's own.
 */

const RENT = '94b82777-eee4-46de-8c18-7490bda02b60'; // seeded system category, recurring_expense
const FOOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-11-05T10:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const snapshot = async (period: string): Promise<ReportSnapshot> => {
  const row = await oneRow<{ snapshot: string }>('monthly_reports', 'user_id = ? AND period_key = ?', USER_ID, period);
  return JSON.parse(row?.snapshot ?? 'null') as ReportSnapshot;
};

describe('Broke Report', () => {
  async function seedOctober() {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    for (let i = 1; i <= 5; i += 1) {
      await seedTransaction({ amount: String(i * 100), counterparty_name: `Shop ${i}`, category_id: FOOD, transaction_at: `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00.000Z` });
    }
  }

  it('rent, transfers and refunds are not spends: the month is the everyday spending only', async () => {
    await seedOctober();
    const itemId = '77777777-7777-4777-8777-777777777777';
    await testDb()
      .prepare(
        `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, timezone, next_due_date, active)
         VALUES (?, ?, 'subscription', 'Rent', 2000000, ?, 'monthly', 1, 'Asia/Kolkata', '2026-11-01', 1)`,
      )
      .bind(itemId, USER_ID, RENT)
      .run();
    await seedTransaction({ amount: '20000', counterparty_name: 'Landlord', category_id: RENT, recurring_item_id: itemId, transaction_at: '2026-10-01T10:00:00.000Z' });
    await seedTransaction({ amount: '9000', counterparty_name: 'ATM', kind: 'transfer', transaction_at: '2026-10-03T10:00:00.000Z' });
    await seedTransaction({ amount: '70000', type: 'credit', counterparty_name: 'Boss', transaction_at: '2026-10-01T10:00:00.000Z' });

    expect(await buildReport(testDb(), USER_ID, '2026-10', Date.now())).toBe('built');
    const snap = await snapshot('2026-10');
    expect(snap).toMatchObject({ debit_count: 5, spent: '1500.00', income: '70000.00' });
    expect(snap.biggest_spend).toMatchObject({ amount: '500.00', display_name: 'Shop 5' });
    expect(snap.categories.map((c) => [c.name, c.amount])).toEqual([['Food', '1500.00']]);
  });

  it('a spend counts what it really cost: a payback lowers it', async () => {
    await seedOctober();
    const hotel = await seedTransaction({ amount: '3000', counterparty_name: 'Hotel', transaction_at: '2026-10-08T10:00:00.000Z' });
    const friend = await seedTransaction({ amount: '2000', type: 'credit', counterparty_name: 'Ravi', kind: 'payback', transaction_at: '2026-11-02T10:00:00.000Z' });
    await testDb().prepare('INSERT INTO transaction_offsets (id, user_id, credit_id, debit_id, amount) VALUES (?, ?, ?, ?, ?)').bind('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', USER_ID, friend, hotel, 200000).run();
    await buildReport(testDb(), USER_ID, '2026-10', Date.now());
    const snap = await snapshot('2026-10');
    expect(snap.spent).toBe('2500.00'); // 1500 + the hotel's remaining 1000
    expect(snap.income).toBe('0.00'); // the payback is not income, even though it arrived in November
  });

  it('the month is cut in the stored timezone of the user', async () => {
    await seedSettings({ timezone: 'America/Los_Angeles' });
    // 5 Oct evenings in Los Angeles are 6 Oct UTC: the instant is in another UTC day, the row's day is its own.
    for (let i = 0; i < 5; i += 1) await seedTransaction({ amount: '100', counterparty_name: `Shop ${i}`, transaction_at: '2026-10-31T23:00:00.000Z', tz: 'America/Los_Angeles' });
    expect(await buildReport(testDb(), USER_ID, '2026-10', Date.now())).toBe('built');
    expect((await snapshot('2026-10')).timezone).toBe('America/Los_Angeles');
    expect((await snapshot('2026-10')).debit_count).toBe(5);
  });
});

describe('email digest', () => {
  const dates = { from: '2026-10-05', to: '2026-10-11' };
  const input = { userId: USER_ID, dates, budgetYear: 2026, budgetMonth: 10 };

  it('transfers and fixed money are not payees, categories or top expenses; paybacks lower the spend', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await seedTransaction({ amount: '300', counterparty_name: 'Cafe', category_id: FOOD, transaction_at: '2026-10-06T10:00:00.000Z' });
    await seedTransaction({ amount: '5000', counterparty_name: 'ATM', kind: 'transfer', transaction_at: '2026-10-06T10:00:00.000Z' });
    const hotel = await seedTransaction({ amount: '1000', counterparty_name: 'Hotel', category_id: FOOD, transaction_at: '2026-10-07T10:00:00.000Z' });
    const friend = await seedTransaction({ amount: '400', type: 'credit', counterparty_name: 'Ravi', kind: 'payback', transaction_at: '2026-10-08T10:00:00.000Z' });
    await testDb().prepare('INSERT INTO transaction_offsets (id, user_id, credit_id, debit_id, amount) VALUES (?, ?, ?, ?, ?)').bind('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', USER_ID, friend, hotel, 40000).run();

    const payload = await buildDigestPayload(testDb(), input);
    expect(payload.spent).toBe('900.00'); // 300 + (1000 - 400)
    expect(payload.income).toBe('0.00');
    expect(payload.payees.map((p) => p[0])).toEqual(['Hotel', 'Cafe']);
    expect(payload.payees.map((p) => p[1])).toEqual(['600.00', '300.00']);
    expect(payload.topExpenses.map((t) => [t[0], t[2]])).toEqual([['Hotel', '600.00'], ['Cafe', '300.00']]); // what each really cost
  });
});
