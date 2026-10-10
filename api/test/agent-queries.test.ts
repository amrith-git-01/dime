/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { beforeEach, describe, expect, it } from 'vitest';

import { defaultQueries, executeQueries, QueryUserError } from '../src/features/agent/queries';
import type { AggGroup, AggMetric, QueryCall } from '../src/features/agent/queries';
import { seedBudget, seedCategory, seedCategoryBudget, seedTransaction, seedUser, testDb, USER_ID } from './db';

/** 2026-06 in Asia/Kolkata, as the half-open UTC instants the tools pass. */
const JUNE = { from: '2026-05-31T18:30:00.000Z', to: '2026-06-30T18:30:00.000Z' };
const TZ = 'Asia/Kolkata';
const OTHER = '22222222-2222-2222-2222-222222222222';

const q = defaultQueries;
const db = () => testDb();
// The query documents are free-form JSON: tests read them with loose access.
type Doc = Record<string, any>;

const at = (day: number, hhmm = '10:00'): string => `2026-06-${String(day).padStart(2, '0')}T${hhmm}:00.000Z`;
const tx = (over: Parameters<typeof seedTransaction>[0]) => seedTransaction({ transaction_at: at(10), ...over });

let FOOD = '';
let TRAVEL = '';

beforeEach(async () => {
  await seedUser(OTHER);
  FOOD = await seedCategory({ name: 'Dining Out' });
  TRAVEL = await seedCategory({ name: 'Trips' });
});

describe('spending_summary', () => {
  it('totals debit, credit, net and counts, in rupees', async () => {
    await tx({ amount: '100.50', type: 'debit' });
    await tx({ amount: '49.50', type: 'debit' });
    await tx({ amount: '1000', type: 'credit', counterparty_name: 'Employer' });
    const r = (await q.spending_summary(db(), USER_ID, { ...JUNE, categoryId: null, payeeKey: null })) as Doc;
    expect(r).toEqual({ debit: 150, credit: 1000, net: 850, debit_count: 2, credit_count: 1, count: 3 });
  });

  it('returns zeros for an empty period', async () => {
    expect(await q.spending_summary(db(), USER_ID, { ...JUNE, categoryId: null, payeeKey: null })).toEqual({ debit: 0, credit: 0, net: 0, debit_count: 0, credit_count: 0, count: 0 });
  });

  it('uses half-open ranges, skips deleted rows and never sees another user', async () => {
    await tx({ amount: '10', transaction_at: JUNE.from }); // included (>= from)
    await tx({ amount: '20', transaction_at: JUNE.to }); // excluded (< to)
    await tx({ amount: '40', transaction_at: '2026-05-31T18:29:59.999Z' }); // just before
    await tx({ amount: '80', deleted_at: '2026-06-02T00:00:00.000Z' });
    await tx({ amount: '160', user_id: OTHER });
    const r = (await q.spending_summary(db(), USER_ID, { ...JUNE, categoryId: null, payeeKey: null })) as Doc;
    expect(r['debit']).toBe(10);
    expect(r['count']).toBe(1);
  });

  it('filters by category and by payee key', async () => {
    await tx({ amount: '100', category_id: FOOD, counterparty_name: 'Swiggy' });
    await tx({ amount: '200', category_id: TRAVEL, counterparty_name: 'Uber' });
    await tx({ amount: '400', counterparty_name: 'Swiggy' });
    const base = { ...JUNE, categoryId: null, payeeKey: null };
    expect(((await q.spending_summary(db(), USER_ID, { ...base, categoryId: FOOD })) as Doc)['debit']).toBe(100);
    expect(((await q.spending_summary(db(), USER_ID, { ...base, payeeKey: 'swiggy' })) as Doc)['debit']).toBe(500);
    expect(((await q.spending_summary(db(), USER_ID, { ...base, payeeKey: 'swiggy', categoryId: FOOD })) as Doc)['debit']).toBe(100);
    expect(((await q.spending_summary(db(), USER_ID, { ...base, payeeKey: 'nobody' })) as Doc)['count']).toBe(0);
  });
});

describe('category_breakdown', () => {
  it('ranks categories, labels the uncategorized rows and computes shares', async () => {
    await tx({ amount: '300', category_id: FOOD });
    await tx({ amount: '100', category_id: TRAVEL });
    await tx({ amount: '100' }); // no category
    await tx({ amount: '5000', type: 'credit', category_id: FOOD });
    const r = (await q.category_breakdown(db(), USER_ID, { ...JUNE, type: 'debit' })) as Doc;
    expect(r['type']).toBe('debit');
    expect(r['total']).toBe(500);
    expect(r['count']).toBe(3);
    expect(r['categories']).toEqual([
      { category_id: FOOD, name: 'Dining Out', total: 300, count: 1, share: 60 },
      // Equal totals and counts: ordered by name, and Uncategorized sorts as '' (first), exactly like Postgres did.
      { name: 'Uncategorized', total: 100, count: 1, share: 20 },
      { category_id: TRAVEL, name: 'Trips', total: 100, count: 1, share: 20 },
    ]);
    expect(r).not.toHaveProperty('other');
    const income = (await q.category_breakdown(db(), USER_ID, { ...JUNE, type: 'credit' })) as Doc;
    expect(income['total']).toBe(5000);
    expect(income['type']).toBe('credit');
  });

  it('keeps the top 8 and folds the rest into "other"', async () => {
    for (let i = 1; i <= 10; i++) await tx({ amount: String(i * 100), category_id: await seedCategory({ name: `Cat ${i}` }) });
    const r = (await q.category_breakdown(db(), USER_ID, { ...JUNE, type: 'debit' })) as Doc;
    expect(r['categories']).toHaveLength(8);
    expect(r['categories'][0]).toMatchObject({ name: 'Cat 10', total: 1000 });
    expect(r['other']).toEqual({ categories: 2, total: 300, count: 2, share: 5.5 }); // (100 + 200) / 5500
    expect(r['total']).toBe(5500);
  });

  it('is empty (not an error) without transactions and ignores other users', async () => {
    await tx({ amount: '90', user_id: OTHER, category_id: FOOD });
    expect(await q.category_breakdown(db(), USER_ID, { ...JUNE, type: 'debit' })).toEqual({ type: 'debit', total: 0, count: 0, categories: [] });
  });
});

describe('top_payees', () => {
  it('ranks by total, uses the oldest NAMED row as the display name and reports shares', async () => {
    await tx({ amount: '100', counterparty_name: '', counterparty_normalized: 'swiggy', transaction_at: at(1) }); // oldest but unnamed
    await tx({ amount: '100', counterparty_name: 'Swiggy Order', counterparty_normalized: 'swiggy', transaction_at: at(2) });
    await tx({ amount: '100', counterparty_name: 'SWIGGY', counterparty_normalized: 'swiggy', transaction_at: at(3) });
    await tx({ amount: '50', counterparty_name: 'Uber', transaction_at: at(4) });
    await tx({ amount: '99', type: 'credit', counterparty_name: 'Employer' }); // income is not spending
    const r = (await q.top_payees(db(), USER_ID, { ...JUNE, categoryId: null, limit: 5 })) as Doc;
    expect(r['total']).toBe(350);
    expect(r['payee_count']).toBe(2);
    expect(r['payees']).toEqual([
      { payee_key: 'swiggy', name: 'Swiggy Order', total: 300, count: 3, share: 85.7 },
      { payee_key: 'uber', name: 'Uber', total: 50, count: 1, share: 14.3 },
    ]);
  });

  it('names a payee without any name "Unknown", limits the list and filters by category', async () => {
    await tx({ amount: '70', counterparty_name: null, counterparty_normalized: null, category_id: FOOD });
    await tx({ amount: '60', counterparty_name: 'A', category_id: TRAVEL });
    await tx({ amount: '50', counterparty_name: 'B', category_id: TRAVEL });
    const all = (await q.top_payees(db(), USER_ID, { ...JUNE, categoryId: null, limit: 2 })) as Doc;
    expect(all['payees'].map((p: Doc) => [p['payee_key'], p['name']])).toEqual([['unknown', 'Unknown'], ['a', 'A']]);
    expect(all['payee_count']).toBe(3);
    const travel = (await q.top_payees(db(), USER_ID, { ...JUNE, categoryId: TRAVEL, limit: 10 })) as Doc;
    expect(travel['payees'].map((p: Doc) => p['payee_key'])).toEqual(['a', 'b']);
    expect(travel['total']).toBe(110);
  });

  it('caps the limit at 10 and handles 150 payees with a constant number of bound values', async () => {
    for (let i = 0; i < 150; i++) await tx({ amount: String(10 + i), counterparty_name: `Shop ${String(i).padStart(3, '0')}` });
    const r = (await q.top_payees(db(), USER_ID, { ...JUNE, categoryId: null, limit: 99 })) as Doc;
    expect(r['payees']).toHaveLength(10);
    expect(r['payee_count']).toBe(150);
    expect(r['payees'][0]).toMatchObject({ name: 'Shop 149', total: 159 });
  });
});

describe('daily_cashflow (local days)', () => {
  it('buckets in the user timezone: 23:30 IST stays on its IST day, 00:00 IST is the next one', async () => {
    await tx({ amount: '100', transaction_at: '2026-06-01T18:00:00.000Z' }); // 2026-06-01 23:30 IST
    await tx({ amount: '25', transaction_at: '2026-06-01T18:30:00.000Z' }); // 2026-06-02 00:00 IST
    await tx({ amount: '500', type: 'credit', transaction_at: '2026-06-02T05:00:00.000Z', counterparty_name: 'Employer' });
    const r = (await q.daily_cashflow(db(), USER_ID, { ...JUNE, tz: TZ })) as Doc;
    expect(r['days']).toEqual([
      { date: '2026-06-01', debit: 100, credit: 0 },
      { date: '2026-06-02', debit: 25, credit: 500 },
    ]);
    expect(r).toMatchObject({ debit_total: 125, credit_total: 500, active_days: 2, peak_debit_day: { date: '2026-06-01', debit: 100 } });
    // The same instants in UTC fall on other days.
    const utc = (await q.daily_cashflow(db(), USER_ID, { from: '2026-06-01T00:00:00.000Z', to: '2026-06-03T00:00:00.000Z', tz: 'UTC' })) as Doc;
    expect(utc['days'].map((d: Doc) => d['date'])).toEqual(['2026-06-01', '2026-06-02']);
    expect(utc['days'][0]).toMatchObject({ debit: 125, credit: 0 }); // both instants are 1 June in UTC
  });

  it('leaves out the peak day when nothing was spent and returns no days for an empty range', async () => {
    await tx({ type: 'credit', amount: '10', counterparty_name: 'Employer' });
    const income = (await q.daily_cashflow(db(), USER_ID, { ...JUNE, tz: TZ })) as Doc;
    expect(income).not.toHaveProperty('peak_debit_day');
    expect(await q.daily_cashflow(db(), USER_ID, { from: '2026-01-01T00:00:00.000Z', to: '2026-01-05T00:00:00.000Z', tz: TZ })).toEqual({ debit_total: 0, credit_total: 0, active_days: 0, days: [] });
  });

  it('breaks a tie for the biggest day in favour of the earlier day', async () => {
    await tx({ amount: '80', transaction_at: at(5) });
    await tx({ amount: '80', transaction_at: at(3) });
    expect(((await q.daily_cashflow(db(), USER_ID, { ...JUNE, tz: TZ })) as Doc)['peak_debit_day']).toEqual({ date: '2026-06-03', debit: 80 });
  });
});

describe('compare_periods', () => {
  const JULY = { from: '2026-06-30T18:30:00.000Z', to: '2026-07-31T18:30:00.000Z' };
  const july = (over: Parameters<typeof seedTransaction>[0]) => seedTransaction({ transaction_at: '2026-07-10T10:00:00.000Z', ...over });

  it('totals both periods with deltas and percentages (absent when the base is 0)', async () => {
    await july({ amount: '150', category_id: FOOD });
    await july({ amount: '1000', type: 'credit', counterparty_name: 'Employer' });
    await tx({ amount: '100', category_id: FOOD });
    const r = (await q.compare_periods(db(), USER_ID, { a: JULY, b: JUNE, by: 'total' })) as Doc;
    expect(r['by']).toBe('total');
    expect(r['a']).toEqual({ debit: 150, credit: 1000, net: 850, count: 2 });
    expect(r['b']).toEqual({ debit: 100, credit: 0, net: -100, count: 1 });
    expect(r['delta']).toEqual({ debit: 50, debit_pct: 50, credit: 1000, net: 950 });
    expect(r).not.toHaveProperty('rows');
    expect(r).not.toHaveProperty('other');
  });

  it('by category: rows ranked by the larger side, with delta_pct only when the baseline is non-zero', async () => {
    await july({ amount: '300', category_id: FOOD });
    await tx({ amount: '200', category_id: FOOD });
    await july({ amount: '90', category_id: TRAVEL });
    await tx({ amount: '10' }); // uncategorized, only in B
    const r = (await q.compare_periods(db(), USER_ID, { a: JULY, b: JUNE, by: 'category' })) as Doc;
    expect(r['rows']).toEqual([
      { id: FOOD, name: 'Dining Out', a: 300, b: 200, delta: 100, delta_pct: 50 },
      { id: TRAVEL, name: 'Trips', a: 90, b: 0, delta: 90 },
      { name: 'Uncategorized', a: 0, b: 10, delta: -10, delta_pct: -100 },
    ]);
  });

  it('by payee: top 8 plus an "other" bucket worth the rest of the period totals', async () => {
    for (let i = 1; i <= 10; i++) await july({ amount: String(i * 10), counterparty_name: `Shop ${String(i).padStart(2, '0')}` });
    await tx({ amount: '5', counterparty_name: 'Shop 01' });
    const r = (await q.compare_periods(db(), USER_ID, { a: JULY, b: JUNE, by: 'payee' })) as Doc;
    expect(r['rows']).toHaveLength(8);
    expect(r['rows'][0]).toMatchObject({ id: 'shop 10', name: 'Shop 10', a: 100, b: 0, delta: 100 });
    // Shops 01 and 02 are left: a = 10 + 20, b = 5.
    expect(r['other']).toEqual({ items: 2, a: 30, b: 5, delta: 25 });
  });

  it('counts a transaction in both periods when they overlap and ignores other users', async () => {
    await tx({ amount: '40' });
    await tx({ amount: '999', user_id: OTHER });
    const r = (await q.compare_periods(db(), USER_ID, { a: JUNE, b: JUNE, by: 'total' })) as Doc;
    expect(r['a']['debit']).toBe(40);
    expect(r['b']['debit']).toBe(40);
    expect(r['delta']).toMatchObject({ debit: 0, debit_pct: 0 });
  });
});

describe('budget_status', () => {
  it('compares the monthly and category budgets with the spending of the month', async () => {
    await seedBudget({ monthly: '1000', daily: '50' });
    await seedCategoryBudget(FOOD, '200');
    await seedCategoryBudget(TRAVEL, '500');
    await tx({ amount: '250', category_id: FOOD });
    await tx({ amount: '100', category_id: TRAVEL });
    await tx({ amount: '25' });
    await tx({ amount: '999', type: 'credit', counterparty_name: 'Employer' }); // income is not spending
    await tx({ amount: '60', category_id: FOOD, transaction_at: '2026-07-10T10:00:00.000Z' }); // other month
    const r = (await q.budget_status(db(), USER_ID, JUNE)) as Doc;
    expect(r).toEqual({
      total_spent: 375,
      monthly: { budget: 1000, spent: 375, remaining: 625, pct_used: 37.5, over: false },
      daily_budget: 50,
      categories: [
        { category_id: FOOD, name: 'Dining Out', budget: 200, spent: 250, remaining: -50, pct_used: 125, over: true },
        { category_id: TRAVEL, name: 'Trips', budget: 500, spent: 100, remaining: 400, pct_used: 20, over: false },
      ],
    });
  });

  it('leaves out budgets that are not set (zero monthly budget, no daily budget)', async () => {
    await seedBudget({ monthly: '0', daily: null });
    await tx({ amount: '10' });
    expect(await q.budget_status(db(), USER_ID, JUNE)).toEqual({ total_spent: 10, categories: [] });
    expect(await q.budget_status(db(), OTHER, JUNE)).toEqual({ total_spent: 0, categories: [] });
  });
});

describe('list_transactions', () => {
  const base = { ...JUNE, tz: TZ, categoryId: null, payeeKey: null, minCents: null, type: null, order: 'date_desc' as const, limit: 10 };

  beforeEach(async () => {
    await tx({ amount: '100', counterparty_name: 'Swiggy', category_id: FOOD, transaction_at: '2026-06-01T18:00:00.000Z', note: 'secret note' });
    await tx({ amount: '300', counterparty_name: 'Uber', category_id: TRAVEL, transaction_at: at(5) });
    await tx({ amount: '200', counterparty_name: '   ', counterparty_normalized: null, transaction_at: at(6) });
    await tx({ amount: '50', type: 'credit', counterparty_name: 'Refund', transaction_at: at(7) });
  });

  it('returns only date (LOCAL), amount, type, payee and category - never the note', async () => {
    const r = (await q.list_transactions(db(), USER_ID, base)) as Doc;
    expect(r['total_count']).toBe(4);
    expect(r['truncated']).toBe(false);
    expect(r['rows']).toEqual([
      { date: '2026-06-07', amount: 50, type: 'credit', payee: 'Refund', category: 'Uncategorized' },
      { date: '2026-06-06', amount: 200, type: 'debit', payee: 'Unknown', category: 'Uncategorized' },
      { date: '2026-06-05', amount: 300, type: 'debit', payee: 'Uber', category: 'Trips' },
      { date: '2026-06-01', amount: 100, type: 'debit', payee: 'Swiggy', category: 'Dining Out' }, // 23:30 IST on the 1st
    ]);
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('orders by date or amount in both directions', async () => {
    const amounts = async (order: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc') =>
      ((await q.list_transactions(db(), USER_ID, { ...base, order })) as Doc)['rows'].map((r: Doc) => r['amount']);
    expect(await amounts('date_desc')).toEqual([50, 200, 300, 100]);
    expect(await amounts('date_asc')).toEqual([100, 300, 200, 50]);
    expect(await amounts('amount_desc')).toEqual([300, 200, 100, 50]);
    expect(await amounts('amount_asc')).toEqual([50, 100, 200, 300]);
  });

  it('limits (at most 20) and says when more matched', async () => {
    const r = (await q.list_transactions(db(), USER_ID, { ...base, limit: 2, order: 'amount_desc' })) as Doc;
    expect(r['rows']).toHaveLength(2);
    expect(r['total_count']).toBe(4);
    expect(r['truncated']).toBe(true);
    for (let i = 0; i < 25; i++) await tx({ amount: '1', counterparty_name: `X${i}` });
    expect(((await q.list_transactions(db(), USER_ID, { ...base, limit: 500 })) as Doc)['rows']).toHaveLength(20);
  });

  it('filters by type, minimum amount (at or above), category and payee', async () => {
    const names = async (over: object) => ((await q.list_transactions(db(), USER_ID, { ...base, ...over })) as Doc)['rows'].map((r: Doc) => r['payee']);
    expect(await names({ type: 'credit' })).toEqual(['Refund']);
    expect(await names({ minCents: 20000, order: 'amount_asc' })).toEqual(['Unknown', 'Uber']);
    expect(await names({ categoryId: FOOD })).toEqual(['Swiggy']);
    expect(await names({ payeeKey: 'uber' })).toEqual(['Uber']);
    expect(await names({ payeeKey: 'unknown' })).toEqual(['Unknown']);
  });

  it('never lists another user\'s rows', async () => {
    await tx({ amount: '777', user_id: OTHER, counterparty_name: 'Spy' });
    expect(JSON.stringify(await q.list_transactions(db(), USER_ID, base))).not.toContain('Spy');
    expect(((await q.list_transactions(db(), OTHER, base)) as Doc)['total_count']).toBe(1);
  });
});

describe('aggregate_transactions', () => {
  const run = async (over: Partial<{ metric: AggMetric; groupBy: AggGroup; type: 'debit' | 'credit' | 'both'; category: string | null; payee: string | null; minCents: number | null; maxCents: number | null; from: string; to: string; tz: string }> = {}, userId = USER_ID) =>
    (await q.aggregate_transactions(db(), userId, { ...JUNE, tz: TZ, metric: 'sum', groupBy: 'none', type: 'debit', category: null, payee: null, minCents: null, maxCents: null, ...over })) as Doc;

  beforeEach(async () => {
    // Mon 1 June 2026 is a Monday. Days: 1 Mon, 2 Tue, 3 Wed, 8 Mon.
    await tx({ amount: '100', counterparty_name: 'Swiggy', category_id: FOOD, transaction_at: '2026-06-01T10:00:00.000Z' }); // Mon
    await tx({ amount: '150', counterparty_name: 'SWIGGY', counterparty_normalized: 'swiggy', category_id: FOOD, transaction_at: '2026-06-02T10:00:00.000Z' }); // Tue
    await tx({ amount: '250', counterparty_name: 'Uber', category_id: TRAVEL, transaction_at: '2026-06-03T10:00:00.000Z' }); // Wed
    await tx({ amount: '199.99', counterparty_name: 'Cafe', transaction_at: '2026-06-08T10:00:00.000Z' }); // Mon, uncategorized
    await tx({ amount: '5000', type: 'credit', counterparty_name: 'Employer', transaction_at: '2026-06-09T10:00:00.000Z' });
    await tx({ amount: '999', counterparty_name: 'Hidden', deleted_at: '2026-06-10T00:00:00.000Z' });
    await tx({ amount: '888', user_id: OTHER, counterparty_name: 'Spy' });
  });

  it('metric x none: sum, avg, count and distinct payees (as one row)', async () => {
    expect((await run({ metric: 'sum' }))['rows']).toEqual([{ group: 'all', value: 699.99, count: 4 }]);
    expect((await run({ metric: 'avg' }))['rows']).toEqual([{ group: 'all', value: 175, count: 4 }]); // 69999 / 4 = 17499.75 cents -> 17500
    expect((await run({ metric: 'count' }))['rows']).toEqual([{ group: 'all', value: 4, count: 4 }]);
    expect((await run({ metric: 'count_distinct_payees' }))['rows']).toEqual([{ group: 'all', value: 3, count: 4 }]); // swiggy x2, uber, cafe
  });

  it('answers with a zero row (count 0) when nothing matches', async () => {
    expect((await run({ metric: 'avg', from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T00:00:00.000Z' }))['rows']).toEqual([{ group: 'all', value: 0, count: 0 }]);
  });

  it('group_by weekday: local weekdays, ranked by the metric, ties in week order', async () => {
    const r = await run({ metric: 'sum', groupBy: 'weekday' });
    expect(r['rows']).toEqual([
      { group: 'Wednesday', value: 250, count: 1 },
      { group: 'Monday', value: 299.99, count: 2 },
      { group: 'Tuesday', value: 150, count: 1 },
    ].sort((a, b) => b.value - a.value));
    expect(r['groups']).toBe(3);
    const counts = await run({ metric: 'count', groupBy: 'weekday' });
    expect(counts['rows'].map((x: Doc) => [x['group'], x['value']])).toEqual([['Monday', 2], ['Tuesday', 1], ['Wednesday', 1]]);
  });

  it('weekday is the LOCAL weekday: 23:30 IST on Sunday is a Sunday, not a Monday', async () => {
    await resetTransactions();
    await tx({ amount: '40', transaction_at: '2026-06-07T18:00:00.000Z' }); // Sunday 7 June 23:30 IST (still Sunday 18:00 UTC)
    await tx({ amount: '60', transaction_at: '2026-06-07T18:30:00.000Z' }); // Monday 8 June 00:00 IST
    const ist = await run({ metric: 'sum', groupBy: 'weekday' });
    expect(ist['rows']).toEqual([{ group: 'Monday', value: 60, count: 1 }, { group: 'Sunday', value: 40, count: 1 }]);
    const utc = await run({ metric: 'sum', groupBy: 'weekday', tz: 'UTC' });
    expect(utc['rows']).toEqual([{ group: 'Sunday', value: 100, count: 2 }]);
  });

  it('group_by month: calendar months in the user timezone, oldest first', async () => {
    await tx({ amount: '10', transaction_at: '2026-05-31T18:30:00.000Z' }); // 1 June 00:00 IST
    await tx({ amount: '20', transaction_at: '2026-06-30T18:00:00.000Z' }); // 30 June 23:30 IST
    await tx({ amount: '30', transaction_at: '2026-06-30T18:30:00.000Z' }); // 1 July 00:00 IST
    const r = await run({ metric: 'sum', groupBy: 'month', from: '2026-05-31T18:30:00.000Z', to: '2026-07-31T18:30:00.000Z' });
    expect(r['rows']).toEqual([
      { group: '2026-06', value: 10 + 100 + 150 + 250 + 199.99 + 20, count: 6 },
      { group: '2026-07', value: 30, count: 1 },
    ]);
  });

  it('group_by category: names joined, ranked, uncategorized labelled', async () => {
    const r = await run({ metric: 'sum', groupBy: 'category' });
    expect(r['rows']).toEqual([
      { group: 'Dining Out', id: FOOD, value: 250, count: 2 },
      { group: 'Trips', id: TRAVEL, value: 250, count: 1 },
      { group: 'Uncategorized', value: 199.99, count: 1 },
    ]);
    const avg = await run({ metric: 'avg', groupBy: 'category' });
    expect(avg['rows'].map((x: Doc) => [x['group'], x['value']])).toEqual([['Trips', 250], ['Uncategorized', 199.99], ['Dining Out', 125]]);
  });

  it('group_by payee: payee_key groups with a display name (oldest named row)', async () => {
    const r = await run({ metric: 'sum', groupBy: 'payee' });
    expect(r['rows']).toEqual([
      { group: 'Uber', id: 'uber', value: 250, count: 1 },
      { group: 'Swiggy', id: 'swiggy', value: 250, count: 2 },
      { group: 'Cafe', id: 'cafe', value: 199.99, count: 1 },
    ].sort((a, b) => b.value - a.value || b.count - a.count));
    const distinct = await run({ metric: 'count_distinct_payees', groupBy: 'category' });
    expect(distinct['rows'].find((x: Doc) => x['group'] === 'Dining Out')).toMatchObject({ value: 1, count: 2 });
  });

  it('bounds the rows (12) and reports how many groups exist', async () => {
    for (let i = 0; i < 20; i++) await tx({ amount: String(300 + i), counterparty_name: `Big ${String(i).padStart(2, '0')}` });
    const r = await run({ metric: 'sum', groupBy: 'payee' });
    expect(r['rows']).toHaveLength(12);
    expect(r['groups']).toBe(23);
    expect(r['truncated']).toBe(true);
    expect(r['rows'][0]).toMatchObject({ group: 'Big 19', value: 319 });
  });

  it('filters: type, amount range (inclusive), category by id or by name, payee by key or by name', async () => {
    expect((await run({ type: 'credit' }))['rows'][0]).toMatchObject({ value: 5000, count: 1 });
    expect((await run({ type: 'both' }))['rows'][0]).toMatchObject({ value: 5699.99, count: 5 });
    expect((await run({ metric: 'count', maxCents: 19999 }))['rows'][0]).toMatchObject({ value: 3 }); // "under 200": 100, 150 and 199.99
    expect((await run({ metric: 'count', maxCents: 19998 }))['rows'][0]).toMatchObject({ value: 2 });
    expect((await run({ metric: 'count', minCents: 15000, maxCents: 25000 }))['rows'][0]).toMatchObject({ value: 3 }); // 150, 250, 199.99
    expect((await run({ category: FOOD }))['rows'][0]).toMatchObject({ value: 250 });
    expect((await run({ category: 'dining OUT' }))['rows'][0]).toMatchObject({ value: 250 });
    expect((await run({ payee: 'swiggy' }))['rows'][0]).toMatchObject({ value: 250, count: 2 });
    expect((await run({ payee: 'Swiggy!' }))['rows'][0]).toMatchObject({ value: 250 }); // normalized like a stored name
    expect((await run({ payee: 'swiggy', category: TRAVEL }))['rows'][0]).toMatchObject({ value: 0, count: 0 });
  });

  it('turns an unknown category name into an error the model can act on, and a bad payee too', async () => {
    await expect(run({ category: 'Nope' })).rejects.toBeInstanceOf(QueryUserError);
    await expect(run({ category: 'Nope' })).rejects.toThrow(/no category named "Nope"/);
    await expect(run({ payee: '***' })).rejects.toThrow(/no letters or digits/);
    const [result] = (await executeQueries(q, db(), USER_ID, [{ name: 'aggregate_transactions', params: { ...JUNE, tz: TZ, metric: 'sum', groupBy: 'none', type: 'debit', category: 'Nope', payee: null, minCents: null, maxCents: null } }])).results;
    expect(result).toEqual({ ok: false, error: expect.stringContaining('no category named') });
  });

  it('does not resolve another user\'s category by name', async () => {
    await seedCategory({ name: 'Secret Stash', user_id: OTHER });
    await expect(run({ category: 'Secret Stash' })).rejects.toThrow(/no category named/);
    expect((await run({ category: 'Secret Stash' }, OTHER))['rows'][0]).toMatchObject({ value: 0 });
  });

  it('never sums another user\'s rows', async () => {
    expect((await run({ type: 'both' }, OTHER))['rows'][0]).toMatchObject({ value: 888, count: 1 });
    expect(JSON.stringify(await run({ groupBy: 'payee' }))).not.toContain('Spy');
  });
});

describe('resolve_entities (trigram matching on D1)', () => {
  const resolve = async (phrases: string[], userId = USER_ID) => (await q.resolve_entities(db(), userId, { phrases })) as { matches: Doc[] };

  beforeEach(async () => {
    for (let i = 0; i < 3; i++) await tx({ amount: '10', counterparty_name: 'Swiggy' });
    await tx({ amount: '10', counterparty_name: 'SWIGGY' });
    for (let i = 0; i < 2; i++) await tx({ amount: '10', counterparty_name: 'Swiggy Instamart' });
    await tx({ amount: '10', counterparty_name: 'Zomato' });
    await tx({ amount: '10', counterparty_name: 'Zomato', deleted_at: '2026-06-02T00:00:00.000Z' });
  });

  it('ranks an exact name first, scores a typo, and counts transactions per payee', async () => {
    const swiggy = (await resolve(['swiggy'])).matches.filter((m) => m['type'] === 'payee');
    expect(swiggy.map((m) => [m['id'], m['name'], m['score'], m['similarity'], m['txn_count']])).toEqual([
      ['swiggy', 'Swiggy', 1, 1, 4], // 'Swiggy' (3) and 'SWIGGY' (1) share the key; the most frequent spelling is the name
      ['swiggy instamart', 'Swiggy Instamart', 1, 0.412, 2], // word_similarity 1 (a whole leading word), similarity 7/17
    ]);
    const typo = (await resolve(['swigy'])).matches.filter((m) => m['type'] === 'payee');
    expect(typo[0]).toMatchObject({ id: 'swiggy', score: 0.667, similarity: 0.625 });
    expect(typo[1]).toMatchObject({ id: 'swiggy instamart' });
  });

  it('finds system and own categories, but not another user\'s', async () => {
    await seedCategory({ name: 'Secret Dining', user_id: OTHER });
    const names = (await resolve(['dining'])).matches.filter((m) => m['type'] === 'category').map((m) => m['name']);
    expect(names).toEqual(expect.arrayContaining(['Food & Dining', 'Dining Out']));
    expect(names).not.toContain('Secret Dining');
    const own = (await resolve(['dining out'])).matches.find((m) => m['type'] === 'category');
    expect(own).toMatchObject({ id: FOOD, name: 'Dining Out', score: 1, similarity: 1, txn_count: 0 });
  });

  it('drops weak matches (below 0.4), short phrases and duplicates; keeps at most 3 per kind and phrase', async () => {
    expect((await resolve(['qqqqq'])).matches).toEqual([]);
    expect((await resolve(['s', ' ', ''])).matches).toEqual([]);
    const twice = await resolve(['Swiggy', 'swiggy ']);
    expect(new Set(twice.matches.map((m) => m['phrase']))).toEqual(new Set(['swiggy']));
    for (let i = 0; i < 6; i++) await tx({ amount: '10', counterparty_name: `Swiggy Express ${i}` });
    const many = (await resolve(['swiggy'])).matches.filter((m) => m['type'] === 'payee');
    expect(many).toHaveLength(3);
  });

  it('never matches another user\'s payees', async () => {
    await tx({ amount: '10', user_id: OTHER, counterparty_name: 'Hotel Kolkata' });
    expect((await resolve(['kolkata'])).matches).toEqual([]);
    expect((await resolve(['kolkata'], OTHER)).matches[0]).toMatchObject({ type: 'payee', name: 'Hotel Kolkata', txn_count: 1 });
  });

  it('caps the scan at the 400 most used payee names', async () => {
    const stmts = [];
    for (let i = 0; i < 405; i++) {
      stmts.push(
        db()
          .prepare('INSERT INTO transactions (id, user_id, amount, type, transaction_at, counterparty_name, payee_key) VALUES (?, ?, 100, ?, ?, ?, ?)')
          .bind(`aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`, USER_ID, 'debit', at(11), `Filler ${String(i).padStart(3, '0')}`, `filler ${String(i).padStart(3, '0')}`),
      );
    }
    for (let i = 0; i < stmts.length; i += 50) await db().batch(stmts.slice(i, i + 50));
    // The 7 fixture names have 1 to 4 transactions; every filler has 1. Names that fall below the cap are not scored.
    expect((await resolve(['swiggy'])).matches.find((m) => m['id'] === 'swiggy')).toBeDefined(); // heavily used: kept
    expect((await resolve(['filler 404'])).matches.length).toBeLessThanOrEqual(3);
  });
});

describe('executeQueries', () => {
  it('runs the calls of a step together, in order, and one failure does not hide the others', async () => {
    await tx({ amount: '100' });
    const calls: QueryCall[] = [
      { name: 'spending_summary', params: { ...JUNE, categoryId: null, payeeKey: null } },
      { name: 'aggregate_transactions', params: { ...JUNE, tz: TZ, metric: 'sum', groupBy: 'none', type: 'debit', category: 'Nope', payee: null, minCents: null, maxCents: null } },
      { name: 'category_breakdown', params: { ...JUNE, type: 'debit' } },
    ];
    const { results } = await executeQueries(defaultQueries, db(), USER_ID, calls);
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[0]).toMatchObject({ ok: true, value: { debit: 100 } });
  });

  it('hides database detail from the model', async () => {
    const broken = { ...defaultQueries, spending_summary: () => Promise.reject(new Error('D1_ERROR: no such table: transactions at secret.sql')) };
    const { results } = await executeQueries(broken, db(), USER_ID, [{ name: 'spending_summary', params: { ...JUNE, categoryId: null, payeeKey: null } }]);
    expect(results[0]).toEqual({ ok: false, error: 'The query failed. Check the arguments or try another approach.' });
  });
});

async function resetTransactions(): Promise<void> {
  await db().prepare('DELETE FROM transactions').run();
}
