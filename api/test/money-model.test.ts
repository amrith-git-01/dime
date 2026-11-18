import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runGuardedSql } from '../src/features/agent/sql-guard';
import { backfillLocalDates } from '../src/features/transactions/backfill';
import { USER_ID, call as callApi, makeCtx, makeEnv } from './helpers';
import { oneRow, rowsOf, seedBudget, seedCategory, seedCategoryBudget, seedSettings, seedTransaction, seedUser, testDb } from './db';

/**
 * The money model (docs/MONEY-MODEL-FIX-PLAN.md batch 1): one definition of "spent" for every surface, paybacks that lower the
 * spend of the month of the original debit, transfers in neither spent nor income, budget alerts that follow the data, month-scoped caps.
 */

const noLimit = () => makeEnv({ WRITE_LIMITER: undefined });
const call: typeof callApi = (path, opts = {}, ctx) => callApi(path, { ...opts, env: opts.env ?? noLimit() }, ctx);
const TZ = 'timezone=Asia%2FKolkata';
const FOOD = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RENT = '94b82777-eee4-46de-8c18-7490bda02b60'; // seeded system category, recurring_expense
const OTHER = '22222222-2222-2222-2222-222222222222';

afterEach(() => vi.useRealTimers());
const setNow = (iso: string) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
};

type Json = Record<string, unknown>;
const summary = async (year: number, month: number): Promise<Json> => (await call(`/api/v1/transactions/month-summary?year=${year}&month=${month}&${TZ}`)).json<Json>();
const get = async (id: string): Promise<Json> => (await call(`/api/v1/transactions/${id}`)).json<Json>();
const link = (credit_id: string, debit_id: string, amount: string | number) => call('/api/v1/transactions/offsets', { method: 'POST', json: { credit_id, debit_id, amount } });

const debit = (over: Parameters<typeof seedTransaction>[0] = {}) => seedTransaction({ type: 'debit', amount: '100', ...over });
const credit = (over: Parameters<typeof seedTransaction>[0] = {}) => seedTransaction({ type: 'credit', amount: '100', ...over });

describe('kind: how a row counts', () => {
  it('defaults: a debit is spend, a credit is income, a self transfer is a transfer; the response says so', async () => {
    const d = await debit({ counterparty_type: 'merchant' });
    const c = await credit({ counterparty_type: 'person' });
    const t = await debit({ counterparty_type: 'self_transfer' });
    expect(await get(d)).toMatchObject({ kind: 'spend', offset_total: '0.00', effective_amount: '100.00' });
    expect(await get(c)).toMatchObject({ kind: 'income' });
    expect(await get(t)).toMatchObject({ kind: 'transfer' });
  });

  it('manual create: an explicit kind wins; a kind that does not fit the direction is a 422', async () => {
    const post = (json: Json) => call(`/api/v1/transactions?${TZ}`, { method: 'POST', json: { amount: '50', counterparty_name: 'Somebody', transaction_at: '2026-10-04T10:00:00+05:30', ...json } });
    expect((await post({ type: 'debit', kind: 'transfer' })).status).toBe(201);
    expect(await oneRow('transactions', "kind = 'transfer'")).toMatchObject({ type: 'debit' });
    expect((await post({ type: 'credit', kind: 'spend' })).status).toBe(422);
    expect((await post({ type: 'debit', kind: 'income' })).status).toBe(422);
    expect((await post({ type: 'debit', kind: 'nonsense' })).status).toBe(422);
  });

  it('manual create: ATM cash, card bills and own-account moves become transfers; a refund becomes a payback', async () => {
    const post = async (json: Json) => {
      const body = await (await call(`/api/v1/transactions?${TZ}`, { method: 'POST', json: { amount: '500', transaction_at: '2026-10-04T10:00:00+05:30', ...json } })).json<{ transaction: { kind: string } }>();
      return body.transaction.kind;
    };
    expect(await post({ type: 'debit', counterparty_name: 'ATM withdrawal' })).toBe('transfer');
    expect(await post({ type: 'debit', counterparty_name: 'HDFC credit card bill' })).toBe('transfer');
    expect(await post({ type: 'debit', counterparty_name: 'Self transfer to savings' })).toBe('transfer');
    expect(await post({ type: 'credit', counterparty_name: 'Amazon refund' })).toBe('payback');
    expect(await post({ type: 'debit', counterparty_name: 'Amazon' })).toBe('spend');
    expect(await post({ type: 'credit', counterparty_name: 'Acme Payroll' })).toBe('income');
  });

  it('count_cash_withdrawals_as_spend: ATM cash is spend for a user who opted in', async () => {
    await seedSettings({ count_cash_withdrawals_as_spend: 1 });
    const body = await (await call(`/api/v1/transactions?${TZ}`, { method: 'POST', json: { amount: '500', type: 'debit', counterparty_name: 'ATM withdrawal', transaction_at: '2026-10-04T10:00:00+05:30' } })).json<{ transaction: { kind: string } }>();
    expect(body.transaction.kind).toBe('spend');
    expect((await summary(2026, 10))['debit_total']).toBe('500.00');
  });

  it('PATCH: an edit keeps the kind unless the direction no longer fits or the counterparty becomes a self transfer', async () => {
    const id = await debit({ counterparty_name: 'Savings' });
    const patch = (json: Json) => call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: { amount: '100', type: 'debit', counterparty_name: 'Savings', transaction_at: '2026-10-04T10:00:00Z', ...json } });
    expect(await (await patch({ counterparty_type: 'self_transfer' })).json()).toMatchObject({ kind: 'transfer' });
    expect(await (await patch({ kind: 'spend' })).json()).toMatchObject({ kind: 'spend' });
    expect(await (await patch({ type: 'credit', counterparty_type: 'merchant' })).json()).toMatchObject({ kind: 'income', type: 'credit' });
  });

  it('the database refuses a kind that does not match the direction', async () => {
    const id = await debit();
    await expect(testDb().prepare("UPDATE transactions SET kind = 'income' WHERE id = ?").bind(id).run()).rejects.toThrow(/direction/);
  });
});

describe('spent: one definition on every surface', () => {
  beforeEach(async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
  });

  it('transfers are in neither spent nor income, but they are listed with their kind', async () => {
    await debit({ amount: '300', category_id: FOOD, transaction_at: '2026-10-04T10:00:00.000Z' });
    await credit({ amount: '1000', counterparty_name: 'Boss', transaction_at: '2026-10-04T10:00:00.000Z' });
    const atm = await debit({ amount: '5000', counterparty_name: 'ATM', kind: 'transfer', transaction_at: '2026-10-04T11:00:00.000Z' });
    await credit({ amount: '2000', counterparty_name: 'Own savings', kind: 'transfer', transaction_at: '2026-10-04T12:00:00.000Z' });

    expect(await summary(2026, 10)).toMatchObject({ debit_total: '300.00', credit_total: '1000.00', net: '700.00', transfer_total: '7000.00', transaction_count: 4 });
    expect(await get(atm)).toMatchObject({ kind: 'transfer' });
    const list = await (await call('/api/v1/transactions')).json<{ items: { kind: string }[] }>();
    expect(list.items.map((i) => i.kind).sort()).toEqual(['income', 'spend', 'transfer', 'transfer']);

    setNow('2026-10-10T08:00:00Z');
    expect(await (await call(`/api/v1/transactions/home?${TZ}`)).json()).toMatchObject({ spent_this_month: '300.00', budget_spent: '300.00', transfer_total: '7000.00', top_categories: [{ category_id: FOOD, total: '300.00' }] });
    const insights = await (await call(`/api/v1/transactions/month-insights?year=2026&month=10&${TZ}`)).json<{ summary: Json; counterparty_spend: Json[]; top_expenses: Json[] }>();
    expect(insights.summary).toMatchObject({ debit_total: '300.00', credit_total: '1000.00', transfer_total: '7000.00' });
    expect(insights.counterparty_spend).toHaveLength(1);
    expect(insights.top_expenses).toHaveLength(1);
  });

  it('the agent view and the month summary agree: spend is net of paybacks and leaves out transfers and income', async () => {
    await debit({ amount: '300', category_id: FOOD, transaction_at: '2026-10-04T10:00:00.000Z' });
    await debit({ amount: '5000', counterparty_name: 'ATM', kind: 'transfer', transaction_at: '2026-10-04T11:00:00.000Z' });
    await credit({ amount: '100', counterparty_name: 'Refund', kind: 'payback', category_id: FOOD, transaction_at: '2026-10-06T11:00:00.000Z' });
    const out = await runGuardedSql(testDb(), USER_ID, "SELECT ROUND(SUM(spend_amount), 2) AS spent, ROUND(SUM(income_amount), 2) AS income FROM transactions WHERE substr(local_date, 1, 7) = '2026-10'", { tzOffsetMinutes: 330 });
    expect(out).toMatchObject({ ok: true, rows: [[200, 0]] });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '200.00', credit_total: '0.00' });
  });

  it('the agent view exposes kind, effective_amount, spend_amount, income_amount, local_date and counts_toward_budget for the caller only', async () => {
    const hotel = await debit({ amount: '10000', counterparty_name: 'Hotel', transaction_at: '2026-10-04T10:00:00.000Z' });
    const friend = await credit({ amount: '4000', counterparty_name: 'Ravi', transaction_at: '2026-10-06T10:00:00.000Z' });
    expect((await link(friend, hotel, '4000')).status).toBe(201);
    await seedUser(OTHER);
    await seedTransaction({ user_id: OTHER, amount: '999', counterparty_name: 'Theirs' });
    const out = await runGuardedSql(testDb(), USER_ID, 'SELECT counterparty_name, kind, amount, effective_amount, spend_amount, income_amount, local_date, counts_toward_budget FROM transactions ORDER BY local_date', { tzOffsetMinutes: 330 });
    expect(out).toMatchObject({
      ok: true,
      rows: [
        ['Hotel', 'spend', 10000, 6000, 6000, 0, '2026-10-04', 1],
        ['Ravi', 'income', 4000, 0, 0, 0, '2026-10-06', 1],
      ],
    });
  });
});

describe('paybacks: the hotel scenarios', () => {
  const HOTEL_DAY = '2026-10-05T10:00:00.000Z';

  it('full payback: the hotel costs nothing and the money received is not income', async () => {
    const hotel = await debit({ amount: '10000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const friend = await credit({ amount: '10000', counterparty_name: 'Ravi', transaction_at: '2026-10-07T10:00:00.000Z' });
    const res = await link(friend, hotel, '10000');
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ credit_id: friend, debit_id: hotel, amount: '10000.00' });

    expect(await get(hotel)).toMatchObject({ kind: 'spend', offset_total: '10000.00', effective_amount: '0.00' });
    // Linking never rewrites the kind: the linked amount is simply not income.
    expect(await get(friend)).toMatchObject({ kind: 'income', offset_total: '10000.00', effective_amount: '0.00' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', credit_total: '0.00', payback_total: '10000.00', budget_spent: '0.00' });
  });

  it('partial payback: the hotel costs what is not paid back', async () => {
    const hotel = await debit({ amount: '10000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const friend = await credit({ amount: '4000', counterparty_name: 'Ravi', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(friend, hotel, 4000);
    expect(await get(hotel)).toMatchObject({ offset_total: '4000.00', effective_amount: '6000.00' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '6000.00', credit_total: '0.00', payback_total: '4000.00' });
  });

  it('an income credit linked for part of its amount: the linked part is not income, the remainder stays income', async () => {
    const hotel = await debit({ amount: '3000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const mom = await credit({ amount: '5000', counterparty_name: 'Mom', transaction_at: '2026-10-07T10:00:00.000Z' });
    expect((await link(mom, hotel, '3000')).status).toBe(201);
    expect(await get(mom)).toMatchObject({ kind: 'income', offset_total: '3000.00', effective_amount: '2000.00' });
    // The hotel is fully paid back (spend 0); Mom's other 2000 is income.
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', credit_total: '2000.00', net: '2000.00', payback_total: '3000.00' });
  });

  it('a payback credit linked for part of its amount: the remainder lowers spend in its own month and category', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    const hotel = await debit({ amount: '3000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    await debit({ amount: '4000', counterparty_name: 'Grocer', category_id: FOOD, transaction_at: '2026-10-06T10:00:00.000Z' });
    const refund = await credit({ amount: '5000', kind: 'payback', category_id: FOOD, counterparty_name: 'Refund', transaction_at: '2026-10-07T10:00:00.000Z' });
    expect((await link(refund, hotel, '3000')).status).toBe(201);
    expect(await get(refund)).toMatchObject({ kind: 'payback', offset_total: '3000.00', effective_amount: '2000.00' });
    // Hotel 3000 - 3000 = 0, grocer 4000, the unlinked 2000 of the refund comes off: 2000 spent, none of it income.
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '2000.00', credit_total: '0.00', payback_total: '5000.00', debit_by_category: { [FOOD]: '2000.00' } });
  });

  it('spend never goes negative: more unmatched refunds than spend shows 0, in the month, the day and the category', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await debit({ amount: '100', category_id: FOOD, transaction_at: '2026-10-04T10:00:00.000Z' });
    await credit({ amount: '700', kind: 'payback', category_id: FOOD, counterparty_name: 'Big refund', transaction_at: '2026-10-09T10:00:00.000Z' });
    const body = await summary(2026, 10);
    expect(body).toMatchObject({ debit_total: '0.00', flexible_debit_total: '0.00', budget_spent: '0.00', payback_total: '700.00' });
    expect(body['debit_by_category']).toEqual({});
    const days = await (await call(`/api/v1/transactions?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z&limit=5&${TZ}`)).json<{ day_summaries: Record<string, { debit_total: string }> }>();
    expect(days.day_summaries['2026-10-09']?.debit_total).toBe('0.00');
    const home = await (await call(`/api/v1/transactions/home?${TZ}`)).json<Json>();
    expect(Number(home['spent_this_month'])).toBeGreaterThanOrEqual(0);
  });

  it('deleting the linked debit makes the links inert: each credit falls back to its own kind', async () => {
    const hotel = await debit({ amount: '3000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const mom = await credit({ amount: '5000', counterparty_name: 'Mom', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(mom, hotel, 3000);
    expect((await summary(2026, 10))['credit_total']).toBe('2000.00');
    await call(`/api/v1/transactions/${hotel}`, { method: 'DELETE' });
    expect(await get(mom)).toMatchObject({ kind: 'income', offset_total: '0.00', effective_amount: '5000.00' });
    expect(await summary(2026, 10)).toMatchObject({ credit_total: '5000.00', debit_total: '0.00' });

    const other = await debit({ amount: '1000', counterparty_name: 'Shop', transaction_at: HOTEL_DAY });
    const refund = await credit({ amount: '1000', kind: 'payback', counterparty_name: 'Refund', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(refund, other, 1000);
    expect((await summary(2026, 10))['debit_total']).toBe('0.00');
    await call(`/api/v1/transactions/${other}`, { method: 'DELETE' });
    // The refund no longer matches anything: it is an unlinked payback again (floored at 0 with nothing else spent).
    expect(await get(refund)).toMatchObject({ kind: 'payback', offset_total: '0.00' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', payback_total: '1000.00' });
  });

  it('two payers split the hotel', async () => {
    const hotel = await debit({ amount: '9000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const a = await credit({ amount: '3000', counterparty_name: 'Asha', transaction_at: '2026-10-06T10:00:00.000Z' });
    const b = await credit({ amount: '3000', counterparty_name: 'Bala', transaction_at: '2026-10-08T10:00:00.000Z' });
    await link(a, hotel, 3000);
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '6000.00' });
    await link(b, hotel, 3000);
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '3000.00', credit_total: '0.00', payback_total: '6000.00' });
    const offsets = await (await call(`/api/v1/transactions/${hotel}/offsets`)).json<{ items: { transaction: { counterparty_name: string } }[]; offset_total: string; effective_amount: string }>();
    expect(offsets.items.map((i) => i.transaction.counterparty_name)).toEqual(['Asha', 'Bala']);
    expect(offsets).toMatchObject({ offset_total: '6000.00', effective_amount: '3000.00' });
  });

  it('restoring a deleted debit through the endpoint brings its links back', async () => {
    const hotel = await debit({ amount: '1000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const friend = await credit({ amount: '1000', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(friend, hotel, 1000);
    await call(`/api/v1/transactions/${hotel}`, { method: 'DELETE' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', credit_total: '1000.00' }); // the friend's money is income again
    expect((await call(`/api/v1/transactions/${hotel}/restore`, { method: 'POST' })).status).toBe(200);
    expect(await get(hotel)).toMatchObject({ offset_total: '1000.00', effective_amount: '0.00' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', credit_total: '0.00', payback_total: '1000.00' });
  });

  it('across months: the payback lowers the month of the original debit, not the month the money arrived', async () => {
    const hotel = await debit({ amount: '10000', counterparty_name: 'Hotel', transaction_at: '2026-10-28T10:00:00.000Z' });
    const friend = await credit({ amount: '10000', counterparty_name: 'Ravi', transaction_at: '2026-11-03T10:00:00.000Z' });
    await link(friend, hotel, 10000);
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', payback_total: '10000.00' });
    expect(await summary(2026, 11)).toMatchObject({ debit_total: '0.00', credit_total: '0.00', payback_total: '0.00' });
  });

  it('refund with no matching debit: an unlinked payback lowers spend in its own month and category', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await debit({ amount: '2000', category_id: FOOD, transaction_at: '2026-10-04T10:00:00.000Z' });
    await credit({ amount: '500', counterparty_name: 'Swiggy refund', kind: 'payback', category_id: FOOD, transaction_at: '2026-10-09T10:00:00.000Z' });
    const body = await summary(2026, 10);
    expect(body).toMatchObject({ debit_total: '1500.00', credit_total: '0.00', payback_total: '500.00', debit_by_category: { [FOOD]: '1500.00' } });
  });

  it('capacity: neither side can be linked for more than it holds; a pair links once', async () => {
    const hotel = await debit({ amount: '1000', transaction_at: HOTEL_DAY });
    const small = await credit({ amount: '600', transaction_at: '2026-10-07T10:00:00.000Z' });
    const other = await credit({ amount: '600', transaction_at: '2026-10-07T11:00:00.000Z' });
    expect((await link(small, hotel, '700')).status).toBe(422); // more than the credit holds
    expect((await link(small, hotel, '600')).status).toBe(201);
    expect((await link(other, hotel, '500')).status).toBe(422); // more than is left on the debit (400)
    expect((await link(other, hotel, '400')).status).toBe(201);
    expect((await link(other, hotel, '1')).status).toBe(409); // already linked
    expect((await link(other, hotel, '0')).status).toBe(422);
  });

  it('direction, kind and ownership are checked', async () => {
    const d1 = await debit({ amount: '100' });
    const d2 = await debit({ amount: '100' });
    const c1 = await credit({ amount: '100' });
    const tr = await credit({ amount: '100', kind: 'transfer' });
    await seedUser(OTHER);
    const theirs = await seedTransaction({ user_id: OTHER, type: 'credit', amount: '100' });
    expect((await link(d1, d2, 50)).status).toBe(422); // a debit cannot pay back
    expect((await link(c1, c1, 50)).status).toBe(422);
    expect((await link(tr, d1, 50)).status).toBe(422); // a transfer is neither
    expect((await link(theirs, d1, 50)).status).toBe(404);
    expect((await link(c1, d1, 50)).status).toBe(201);
  });

  it('unlinking restores the spend and the income; the credit kind was never touched', async () => {
    const hotel = await debit({ amount: '1000', transaction_at: HOTEL_DAY });
    const friend = await credit({ amount: '1000', transaction_at: '2026-10-07T10:00:00.000Z' });
    const { id } = await (await link(friend, hotel, 1000)).json<{ id: string }>();
    expect((await summary(2026, 10))['debit_total']).toBe('0.00');
    expect((await call(`/api/v1/transactions/offsets/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await get(friend)).toMatchObject({ kind: 'income', offset_total: '0.00' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '1000.00', credit_total: '1000.00', payback_total: '0.00' });
    expect((await call(`/api/v1/transactions/offsets/${id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('a linked credit can switch between income and payback, but not become a transfer or change direction', async () => {
    const hotel = await debit({ amount: '3000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const mom = await credit({ amount: '5000', counterparty_name: 'Mom', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(mom, hotel, 3000);
    const patch = (json: Json) => call(`/api/v1/transactions/${mom}`, { method: 'PATCH', json });
    expect((await patch({ kind: 'payback' })).status).toBe(200);
    expect(await get(mom)).toMatchObject({ kind: 'payback', offset_total: '3000.00', effective_amount: '2000.00' });
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', credit_total: '0.00' }); // the 2000 left is now a refund: spend floors at 0
    expect((await patch({ kind: 'income' })).status).toBe(200);
    expect(await summary(2026, 10)).toMatchObject({ debit_total: '0.00', credit_total: '2000.00' });
    expect((await patch({ kind: 'transfer' })).status).toBe(422);
    expect((await patch({ type: 'debit' })).status).toBe(422);
    expect((await patch({ amount: '2000' })).status).toBe(422); // below what is linked
    expect(await get(mom)).toMatchObject({ kind: 'income', amount: '5000.00' });
  });

  it('soft-deleting either side makes the link inert; restoring the row brings it back', async () => {
    const hotel = await debit({ amount: '1000', transaction_at: HOTEL_DAY });
    const friend = await credit({ amount: '1000', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(friend, hotel, 1000);
    await call(`/api/v1/transactions/${friend}`, { method: 'DELETE' });
    expect(await get(hotel)).toMatchObject({ offset_total: '0.00', effective_amount: '1000.00' });
    expect((await summary(2026, 10))['debit_total']).toBe('1000.00');
    await testDb().prepare('UPDATE transactions SET deleted_at = NULL WHERE id = ?').bind(friend).run();
    expect(await get(hotel)).toMatchObject({ offset_total: '1000.00', effective_amount: '0.00' });
  });

  it('a row with paybacks linked cannot shrink below them or change direction until they are unlinked', async () => {
    const hotel = await debit({ amount: '1000', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY });
    const friend = await credit({ amount: '600', transaction_at: '2026-10-07T10:00:00.000Z' });
    await link(friend, hotel, 600);
    const patch = (json: Json) => call(`/api/v1/transactions/${hotel}`, { method: 'PATCH', json: { amount: '1000', type: 'debit', counterparty_name: 'Hotel', transaction_at: HOTEL_DAY, ...json } });
    expect((await patch({ amount: '500' })).status).toBe(422);
    expect((await patch({ type: 'credit' })).status).toBe(422);
    expect((await patch({ amount: '800' })).status).toBe(200);
  });

  it('payback candidates: a credit is offered the recent debits that fit, same payee first; a debit the later credits', async () => {
    const hotel = await debit({ amount: '10000', counterparty_name: 'Hotel', transaction_at: '2026-10-05T10:00:00.000Z' });
    await debit({ amount: '10000', counterparty_name: 'Other shop', transaction_at: '2026-10-06T10:00:00.000Z' });
    await debit({ amount: '50', counterparty_name: 'Tea', transaction_at: '2026-10-06T10:00:00.000Z' }); // too small
    await debit({ amount: '10000', counterparty_name: 'Old', transaction_at: '2026-08-01T10:00:00.000Z' }); // outside 45 days
    const friend = await credit({ amount: '10000', counterparty_name: 'Hotel', transaction_at: '2026-10-08T10:00:00.000Z' });
    const forCredit = await (await call(`/api/v1/transactions/${friend}/payback-candidates`)).json<{ items: { transaction: { id: string; counterparty_name: string }; remaining: string; payee_match: boolean }[] }>();
    expect(forCredit.items.map((i) => i.transaction.counterparty_name)).toEqual(['Hotel', 'Other shop']);
    expect(forCredit.items[0]).toMatchObject({ payee_match: true, remaining: '10000.00' });
    const forDebit = await (await call(`/api/v1/transactions/${hotel}/payback-candidates`)).json<{ items: { transaction: { id: string } }[] }>();
    expect(forDebit.items.map((i) => i.transaction.id)).toEqual([friend]);
    const none = await (await call(`/api/v1/transactions/${await debit({ kind: 'transfer', counterparty_name: 'ATM' })}/payback-candidates`)).json<{ items: unknown[] }>();
    expect(none.items).toEqual([]);
  });
});

describe('the monthly budget: flexible spend plus recurring items that count', () => {
  const itemId = '77777777-7777-4777-8777-777777777777';
  const seedItem = (counts: 0 | 1) =>
    testDb()
      .prepare(
        `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, timezone, next_due_date, active, counts_toward_budget)
         VALUES (?, ?, 'subscription', 'Rent', 2000000, ?, 'monthly', 1, 'Asia/Kolkata', '2026-11-01', 1, ?)`,
      )
      .bind(itemId, USER_ID, RENT, counts)
      .run();

  it('rent is committed by default, budget_left is signed, and opting the item in moves it into the budget', async () => {
    await seedBudget({ monthly: '10000' });
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await seedItem(0);
    await debit({ amount: '3000', category_id: FOOD, transaction_at: '2026-10-04T10:00:00.000Z' });
    await debit({ amount: '20000', counterparty_name: 'Landlord', category_id: RENT, recurring_item_id: itemId, transaction_at: '2026-10-01T10:00:00.000Z' });

    const before = await summary(2026, 10);
    expect(before).toMatchObject({ debit_total: '23000.00', budget_spent: '3000.00', budget_left: '7000.00', committed_total: '20000.00', monthly_budget: '10000.00', fixed_debit_total: '20000.00' });

    const patched = await call(`/api/v1/recurring/${itemId}`, { method: 'PATCH', json: { counts_toward_budget: true } });
    expect(patched.status).toBe(200);
    const after = await summary(2026, 10);
    expect(after).toMatchObject({ budget_spent: '23000.00', budget_left: '-13000.00', committed_total: '0.00' });
  });

  it('home and insights read the same budget fields; no cap means budget_left is null', async () => {
    setNow('2026-10-10T08:00:00Z');
    await debit({ amount: '400', transaction_at: '2026-10-04T10:00:00.000Z' });
    expect(await (await call(`/api/v1/transactions/home?${TZ}`)).json()).toMatchObject({ budget_spent: '400.00', budget_left: null, monthly_budget: null, committed_total: '0.00' });
    await seedBudget({ monthly: '1000' });
    expect(await (await call(`/api/v1/transactions/home?${TZ}`)).json()).toMatchObject({ budget_left: '600.00', monthly_budget: '1000.00' });
    const insights = await (await call(`/api/v1/transactions/month-insights?year=2026&month=10&${TZ}`)).json<{ summary: Json }>();
    expect(insights.summary).toMatchObject({ budget_spent: '400.00', committed_total: '0.00' });
  });
});

describe('budget history: a month keeps the cap it had', () => {
  it('a budget set now applies from this month on; past months keep their cap', async () => {
    setNow('2026-10-10T08:00:00Z');
    await seedBudget({ monthly: '1000' }); // from the beginning
    expect((await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '2000' } })).status).toBe(200);
    expect(await summary(2026, 9)).toMatchObject({ monthly_budget: '1000.00' });
    expect(await summary(2026, 10)).toMatchObject({ monthly_budget: '2000.00' });
    expect(await summary(2026, 12)).toMatchObject({ monthly_budget: '2000.00' }); // applies to later months until changed
    expect(await (await call('/api/v1/budget')).json()).toMatchObject({ budget: { monthly_budget: '2000.00' } });
  });

  it('the cap of a past month decides whether that month was over', async () => {
    setNow('2026-10-10T08:00:00Z');
    await seedBudget({ monthly: '1000' });
    await debit({ amount: '900', transaction_at: '2026-09-10T10:00:00.000Z' });
    await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '500' } });
    expect(await summary(2026, 9)).toMatchObject({ budget_spent: '900.00', budget_left: '100.00' });
  });
});

describe('budget alerts follow the data (reconcile after every write)', () => {
  const alertKeys = async () => (await rowsOf<{ dedupe_key: string }>('notifications', "dedupe_key LIKE 'budget:%'")).map((n) => n.dedupe_key).sort();
  const post = async (json: Json) => {
    const { ctx, flush } = makeCtx();
    const res = await call(`/api/v1/transactions?${TZ}`, { method: 'POST', json: { type: 'debit', counterparty_name: 'Store', transaction_at: '2026-10-04T10:00:00+05:30', ...json } }, ctx);
    await flush();
    return res.json<{ id: string }>();
  };
  const patch = async (id: string, json: Json) => {
    const { ctx, flush } = makeCtx();
    const res = await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: { type: 'debit', counterparty_name: 'Store', transaction_at: '2026-10-04T10:00:00+05:30', ...json } }, ctx);
    await flush();
    return res;
  };
  const del = async (id: string) => {
    const { ctx, flush } = makeCtx();
    const res = await call(`/api/v1/transactions/${id}`, { method: 'DELETE' }, ctx);
    await flush();
    return res;
  };

  beforeEach(async () => {
    setNow('2026-10-20T08:00:00Z');
    await seedBudget({ monthly: '1000' });
  });

  it('crossing 80% then 100% raises each once', async () => {
    await post({ amount: '850' });
    expect(await alertKeys()).toEqual(['budget:monthly:80:2026-10']);
    await post({ amount: '200' });
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10', 'budget:monthly:80:2026-10']);
    await post({ amount: '50' });
    expect(await alertKeys()).toHaveLength(2); // nothing new to say
  });

  it('delete retires the alert whose threshold is no longer true, and re-crossing raises it again', async () => {
    const { id } = await post({ amount: '1200' });
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
    expect((await del(id)).status).toBe(204);
    expect(await alertKeys()).toEqual([]);
    await post({ amount: '1100' });
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
  });

  it('edit across months: the old month retires its alert silently, the new current month raises one', async () => {
    const { id } = await post({ amount: '900' });
    expect(await alertKeys()).toEqual(['budget:monthly:80:2026-10']);
    // Move it into last month (a past month: nothing is raised for it) ...
    expect((await patch(id, { amount: '900', transaction_at: '2026-09-15T10:00:00+05:30' })).status).toBe(200);
    expect(await alertKeys()).toEqual([]);
    // ... and back.
    expect((await patch(id, { amount: '900', transaction_at: '2026-10-05T10:00:00+05:30' })).status).toBe(200);
    expect(await alertKeys()).toEqual(['budget:monthly:80:2026-10']);
  });

  it('editing the amount down retires "over" and the category alert', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await seedCategoryBudget(FOOD, '500');
    const { id } = await post({ amount: '600', category_id: FOOD });
    expect(await alertKeys()).toEqual([`budget:category:${FOOD}:100:2026-10`]);
    await patch(id, { amount: '300', category_id: FOOD });
    expect(await alertKeys()).toEqual([]);
  });

  it('raising the cap retires the alert; crossing the new cap raises it again as a new row', async () => {
    await post({ amount: '1200' });
    const first = await oneRow<{ id: string }>('notifications', "dedupe_key = 'budget:monthly:100:2026-10'");
    const { ctx, flush } = makeCtx();
    expect((await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '2000' } }, ctx)).status).toBe(200);
    await flush();
    expect(await alertKeys()).toEqual([]);
    await post({ amount: '900', counterparty_name: 'Another' });
    const second = await oneRow<{ id: string }>('notifications', "dedupe_key = 'budget:monthly:100:2026-10'");
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first?.id);
  });

  it('lowering the cap crosses the new cap at once', async () => {
    await post({ amount: '600' });
    expect(await alertKeys()).toEqual([]);
    const { ctx, flush } = makeCtx();
    await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '500' } }, ctx);
    await flush();
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
  });

  it('a past month is reconciled silently: a write into it never raises an alert', async () => {
    await post({ amount: '1500', transaction_at: '2026-09-04T10:00:00+05:30' });
    expect(await alertKeys()).toEqual([]);
  });

  it('transfers and income do not move the budget; a payback link lowers the spend and retires the alert', async () => {
    await post({ amount: '5000', kind: 'transfer', counterparty_name: 'ATM' });
    await post({ amount: '5000', type: 'credit', counterparty_name: 'Boss' });
    expect(await alertKeys()).toEqual([]);

    const hotel = await post({ amount: '1500', counterparty_name: 'Hotel' });
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
    const friend = await credit({ amount: '1000', counterparty_name: 'Ravi', transaction_at: '2026-10-07T10:00:00.000Z' });
    const { ctx, flush } = makeCtx();
    expect((await call('/api/v1/transactions/offsets', { method: 'POST', json: { credit_id: friend, debit_id: hotel.id, amount: '1000' } }, ctx)).status).toBe(201);
    await flush();
    expect(await alertKeys()).toEqual([]); // 500 of 1000 now
    const unlink = await (await call(`/api/v1/transactions/${hotel.id}/offsets`)).json<{ items: { id: string }[] }>();
    const again = makeCtx();
    await call(`/api/v1/transactions/offsets/${unlink.items[0]?.id ?? ''}`, { method: 'DELETE' }, again.ctx);
    await again.flush();
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
  });

  it('a recurring item opting in or out of the budget re-checks the month', async () => {
    const itemId = '77777777-7777-4777-8777-777777777777';
    await testDb()
      .prepare(
        `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, timezone, next_due_date, active, counts_toward_budget)
         VALUES (?, ?, 'subscription', 'Rent', 2000000, ?, 'monthly', 1, 'Asia/Kolkata', '2026-11-01', 1, 0)`,
      )
      .bind(itemId, USER_ID, RENT)
      .run();
    await debit({ amount: '20000', counterparty_name: 'Landlord', category_id: RENT, recurring_item_id: itemId, transaction_at: '2026-10-01T10:00:00.000Z' });
    const toggle = async (counts: boolean) => {
      const { ctx, flush } = makeCtx();
      await call(`/api/v1/recurring/${itemId}`, { method: 'PATCH', json: { counts_toward_budget: counts } }, ctx);
      await flush();
    };
    expect(await alertKeys()).toEqual([]);
    await toggle(true);
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
    await toggle(false);
    expect(await alertKeys()).toEqual([]);
  });

  it('restoring a deleted transaction re-alerts: the shared write path reconciles its month again', async () => {
    const { id } = await post({ amount: '1200' });
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
    expect((await del(id)).status).toBe(204);
    expect(await alertKeys()).toEqual([]);
    const { ctx, flush } = makeCtx();
    const res = await call(`/api/v1/transactions/${id}/restore`, { method: 'POST' }, ctx);
    await flush();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id, amount: '1200.00', deleted_at: null });
    expect(await alertKeys()).toEqual(['budget:monthly:100:2026-10']);
    expect((await summary(2026, 10))['debit_total']).toBe('1200.00');
  });

  it('removing a category budget retires its alerts', async () => {
    await seedCategory({ id: FOOD, name: 'Food', user_id: USER_ID });
    await seedCategoryBudget(FOOD, '100');
    await post({ amount: '150', category_id: FOOD });
    expect(await alertKeys()).toContain(`budget:category:${FOOD}:100:2026-10`);
    const { ctx, flush } = makeCtx();
    expect((await call(`/api/v1/budget/categories/${FOOD}`, { method: 'DELETE' }, ctx)).status).toBe(204);
    await flush();
    expect((await alertKeys()).filter((k) => k.startsWith('budget:category'))).toEqual([]);
  });
});

describe('local dates: the timezone of the user, computed once on write', () => {
  const post = (json: Json, tz = 'Asia/Kolkata') =>
    call(`/api/v1/transactions?timezone=${encodeURIComponent(tz)}`, { method: 'POST', json: { type: 'debit', amount: '10', counterparty_name: 'Cafe', ...json } });

  it('a write stores local_date and month_key from the instant in the timezone', async () => {
    await post({ transaction_at: '2026-10-31T20:00:00Z' }); // 01:30 on 1 Nov in Kolkata
    expect(await oneRow('transactions', '1 = 1')).toMatchObject({ local_date: '2026-11-01', month_key: '2026-11' });
  });

  it('the stored timezone wins over the device one: a late evening in New York stays on its own day', async () => {
    await seedSettings({ timezone: 'America/New_York' });
    await post({ transaction_at: '2026-10-31T23:30:00-04:00' }, 'Asia/Kolkata');
    expect(await oneRow('transactions', '1 = 1')).toMatchObject({ local_date: '2026-10-31', month_key: '2026-10' });
    expect((await summary(2026, 10))['debit_total']).toBe('10.00');
  });

  it('month totals bucket by the stored local month, not by the UTC instant', async () => {
    await seedTransaction({ amount: '10', transaction_at: '2026-09-30T20:00:00.000Z' }); // 1 Oct IST
    await seedTransaction({ amount: '20', transaction_at: '2026-10-31T19:00:00.000Z' }); // 1 Nov IST
    expect((await summary(2026, 10))['debit_total']).toBe('10.00');
    expect((await summary(2026, 11))['debit_total']).toBe('20.00');
  });

  it('a PATCH that moves the instant moves the day; one that echoes the same instant keeps it', async () => {
    const id = await debit({ amount: '10', counterparty_name: 'Cafe', transaction_at: '2026-10-04T10:00:00.000Z', local_date: '2026-10-03' });
    const body = (over: Json) => ({ amount: '10', type: 'debit', counterparty_name: 'Cafe', transaction_at: '2026-10-04T10:00:00.000Z', ...over });
    await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: body({ note: 'x' }) });
    expect(await oneRow('transactions', 'id = ?', id)).toMatchObject({ local_date: '2026-10-03' });
    await call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: body({ transaction_at: '2026-10-09T10:00:00.000Z' }) });
    expect(await oneRow('transactions', 'id = ?', id)).toMatchObject({ local_date: '2026-10-09', month_key: '2026-10' });
  });

  it('rows the backfill has not reached are read in IST; the backfill fills them in each owner zone', async () => {
    await seedSettings({ timezone: 'America/New_York' });
    const ny = await seedTransaction({ amount: '10', transaction_at: '2026-10-31T23:30:00.000Z', local_date: null }); // 19:30 EDT, still 31 Oct
    await seedUser(OTHER);
    await seedSettings({ timezone: 'Asia/Tokyo' }, OTHER);
    const tokyo = await seedTransaction({ user_id: OTHER, amount: '10', transaction_at: '2026-10-31T23:30:00.000Z', local_date: null }); // 08:30 JST, 1 Nov
    expect((await summary(2026, 11))['debit_total']).toBe('10.00'); // IST fallback: 05:00 on 1 Nov

    expect(await backfillLocalDates(testDb())).toBe(2);
    expect(await oneRow('transactions', 'id = ?', ny)).toMatchObject({ local_date: '2026-10-31', month_key: '2026-10' });
    expect(await oneRow('transactions', 'id = ?', tokyo)).toMatchObject({ local_date: '2026-11-01', month_key: '2026-11' });
    expect(await backfillLocalDates(testDb())).toBe(0);
  });

  it('a user with no stored timezone is reported in IST', async () => {
    await seedTransaction({ amount: '10', transaction_at: '2026-09-30T20:00:00.000Z', local_date: null });
    expect((await summary(2026, 10))['debit_total']).toBe('10.00');
  });
});
