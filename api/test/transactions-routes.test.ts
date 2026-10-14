import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Bindings } from '../src/core/env';
import { buildPaymentHash } from '../src/features/transactions/dedupe';
import { USER_ID, call, makeCtx, makeEnv, signToken } from './helpers';
import {
  failingOn,
  oneRow,
  rowsOf,
  seedBudget,
  seedCategory,
  seedCategoryBudget,
  seedJob,
  seedNotification,
  seedPushToken,
  seedSettings,
  seedTransaction,
  seedUser,
  testDb,
} from './db';
import { json, useSupabaseStub } from './supabase-stub';

// Relational data lives in D1; the stub only serves Storage signing and the Expo push endpoint.
const stub = useSupabaseStub();

const TX = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAT2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const KEY = '5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b';
const TZ = 'timezone=Asia%2FKolkata';
/** Seeded system category "Income". */
const INCOME = '2aedfd2c-7a2d-48e9-9b9c-8918dd4e9715';

/** A "Food" category with stray spaces around the name (responses trim it). */
const seedFood = () => seedCategory({ id: CAT, name: ' Food ', icon_name: 'Utensils', color: '#111111', user_id: USER_ID });

/** The default transaction of these tests: an uncategorised Swiggy debit of 480.00 (pass `category_id: CAT` for Food). */
const seedTx = (over: Parameters<typeof seedTransaction>[0] = {}) =>
  seedTransaction({
    id: TX,
    amount: '480.00',
    type: 'debit',
    counterparty_name: ' Swiggy ',
    counterparty_normalized: 'swiggy',
    category_id: null,
    detected_via: 'sms',
    transaction_at: '2026-10-04T10:00:00.000Z',
    created_at: '2026-10-04T10:00:05.123Z',
    ...over,
  });

afterEach(() => {
  vi.useRealTimers();
});

interface InsightsBody {
  year: number;
  month: number;
  summary: unknown;
  daily_cashflow: unknown[];
  counterparty_spend: unknown[];
  counterparty_income: Record<string, unknown>[];
  top_expenses: Record<string, unknown>[];
}

describe('auth', () => {
  it('401 without a token on every transaction route', async () => {
    for (const [method, path] of [
      ['GET', '/api/v1/transactions'],
      ['GET', '/api/v1/transactions/home?timezone=UTC'],
      ['GET', `/api/v1/transactions/${TX}`],
      ['POST', `/api/v1/transactions?${TZ}`],
      ['PATCH', `/api/v1/transactions/${TX}`],
      ['DELETE', `/api/v1/transactions/${TX}`],
    ] as const) {
      expect((await call(path, { method, token: false })).status, `${method} ${path}`).toBe(401);
    }
    expect(stub.calls).toHaveLength(0);
  });
});

describe('GET /transactions', () => {
  it('lists newest first, enriched with category display fields', async () => {
    await seedFood();
    await seedTx({ category_id: CAT });
    const res = await call('/api/v1/transactions');
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Record<string, unknown>[]; has_more: boolean; day_summaries: unknown }>();
    expect(body.has_more).toBe(false);
    expect(body.day_summaries).toEqual({});
    expect(body.items[0]).toEqual({
      id: TX,
      user_id: USER_ID,
      amount: '480.00',
      type: 'debit',
      counterparty_name: ' Swiggy ',
      counterparty_type: 'merchant',
      counterparty_normalized: 'swiggy',
      merchant: 'Swiggy',
      category: 'Food',
      category_id: CAT,
      category_icon_name: 'Utensils',
      category_color: '#111111',
      note: null,
      detected_via: 'sms',
      transaction_at: '2026-10-04T10:00:00.000Z',
      created_at: '2026-10-04T10:00:05.123Z',
      updated_at: '2026-10-04T10:00:05.123Z',
      deleted_at: null,
      receipt_url: null,
      voice_url: null,
      payment_hash: null,
    });
  });

  it('is scoped to the caller, hides deleted rows, and orders newest first (id breaks ties)', async () => {
    await seedUser('99999999-9999-9999-9999-999999999999');
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000001', transaction_at: '2026-10-01T00:00:00.000Z' });
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000002', transaction_at: '2026-10-03T00:00:00.000Z' });
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000003', transaction_at: '2026-10-03T00:00:00.000Z' });
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000004', deleted_at: '2026-10-04T00:00:00.000Z' });
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000005', user_id: '99999999-9999-9999-9999-999999999999' });
    const body = await (await call('/api/v1/transactions')).json<{ items: { id: string }[] }>();
    expect(body.items.map((i) => i.id.slice(-1))).toEqual(['3', '2', '1']);
  });

  it('maps null detected_via / counterparty_type / names and categories the user cannot see', async () => {
    await seedFood();
    await seedTx({ id: 'b1000000-0000-4000-8000-000000000001', detected_via: 'notification', counterparty_type: null, category_id: null });
    await seedTx({
      id: 'b2000000-0000-4000-8000-000000000002',
      detected_via: null,
      counterparty_name: null,
      counterparty_normalized: null,
      category_id: CAT,
      transaction_at: '2026-10-03T10:00:00.000Z',
    });
    const body = await (await call('/api/v1/transactions')).json<{ items: Record<string, unknown>[] }>();
    expect(body.items[0]).toMatchObject({ detected_via: 'notification', counterparty_type: 'merchant', category: null, category_id: null });
    expect(body.items[1]).toMatchObject({ detected_via: null, counterparty_type: 'merchant', merchant: '', counterparty_name: null, category: 'Food' });
  });

  it('uses a half-open [from, to) range and pages with limit/offset', async () => {
    // Four rows in October, one exactly at the (exclusive) end, one before the start.
    for (const [i, at] of [
      [1, '2026-10-01T00:00:00.000Z'],
      [2, '2026-10-10T00:00:00.000Z'],
      [3, '2026-10-20T00:00:00.000Z'],
      [4, '2026-10-30T00:00:00.000Z'],
      [5, '2026-11-01T00:00:00.000Z'],
      [6, '2026-09-30T23:59:59.999Z'],
    ] as const) {
      await seedTransaction({ id: `00000000-0000-4000-8000-00000000000${i}`, transaction_at: at });
    }
    const range = 'from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z';
    const first = await (await call(`/api/v1/transactions?${range}&limit=2&offset=0`)).json<{ items: { id: string }[]; has_more: boolean }>();
    expect(first.items.map((i) => i.id.slice(-1))).toEqual(['4', '3']);
    expect(first.has_more).toBe(true);
    const second = await (await call(`/api/v1/transactions?${range}&limit=2&offset=2`)).json<{ items: { id: string }[]; has_more: boolean }>();
    expect(second.items.map((i) => i.id.slice(-1))).toEqual(['2', '1']);
    expect(second.has_more).toBe(false);
    const third = await (await call(`/api/v1/transactions?${range}&limit=2&offset=4`)).json<{ items: unknown[]; has_more: boolean }>();
    expect(third.items).toHaveLength(0);
  });

  it('first page of a range with a timezone also returns day summaries (bucketed in the user timezone)', async () => {
    // 2026-10-01 IST: credit 100, debits 100 + 135 ; 2026-10-02 IST: debit 50.50.
    await seedTransaction({ amount: '100', type: 'credit', transaction_at: '2026-10-01T03:30:00.000Z' });
    await seedTransaction({ amount: '100', type: 'debit', transaction_at: '2026-10-01T07:30:00.000Z' });
    await seedTransaction({ amount: '135', type: 'debit', transaction_at: '2026-10-01T08:30:00.000Z' });
    await seedTransaction({ amount: '50.50', type: 'debit', transaction_at: '2026-10-02T04:00:00.000Z' });
    // Outside the range or deleted: not counted.
    await seedTransaction({ amount: '999', type: 'debit', transaction_at: '2026-09-30T18:29:59.999Z' });
    await seedTransaction({ amount: '999', type: 'debit', transaction_at: '2026-10-01T09:00:00.000Z', deleted_at: '2026-10-02T00:00:00.000Z' });
    const res = await call(`/api/v1/transactions?from=2026-09-30T18:30:00Z&to=2026-10-31T18:30:00Z&${TZ}`);
    const body = await res.json<{ day_summaries: Record<string, unknown> }>();
    expect(body.day_summaries).toEqual({
      '2026-10-01': { date: '2026-10-01', credit_total: '100.00', debit_total: '235.00', net: '-135.00', transaction_count: 3 },
      '2026-10-02': { date: '2026-10-02', credit_total: '0.00', debit_total: '50.50', net: '-50.50', transaction_count: 1 },
    });
  });

  it('C3: category_id and payee filters; day summaries are skipped when filtering', async () => {
    await seedFood();
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000001', counterparty_name: 'Swiggy India', category_id: CAT, transaction_at: '2026-10-02T00:00:00.000Z' });
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000002', counterparty_name: 'SWIGGY INDIA PVT', category_id: null, transaction_at: '2026-10-03T00:00:00.000Z' });
    await seedTransaction({ id: '00000000-0000-4000-8000-000000000003', counterparty_name: 'Uber', category_id: CAT, transaction_at: '2026-10-04T00:00:00.000Z' });
    const ids = async (query: string) => (await (await call(`/api/v1/transactions?${query}`)).json<{ items: { id: string }[] }>()).items.map((i) => i.id.slice(-1));

    expect(await ids('payee=swiggy')).toEqual(['2', '1']);
    expect(await ids('payee=Swiggy%20India')).toEqual(['2', '1']);
    expect(await ids(`category_id=${CAT}`)).toEqual(['3', '1']);
    expect(await ids(`category_id=${CAT}&payee=uber`)).toEqual(['3']);
    expect(await ids('payee=no%20such%20payee')).toEqual([]);
    // `_` is a literal in the payee filter, `%` is stripped.
    expect(await ids('payee=swig_y')).toEqual([]);
    const res = await call(`/api/v1/transactions?category_id=${CAT}&payee=Swiggy%20India&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&${TZ}`);
    expect(res.status).toBe(200);
    expect((await res.json<{ day_summaries: unknown }>()).day_summaries).toEqual({});
  });

  it('ignores empty filter params', async () => {
    await seedTx();
    const res = await call('/api/v1/transactions?payee=&category_id=');
    expect(res.status).toBe(200);
    expect((await res.json<{ items: unknown[] }>()).items).toHaveLength(1);
  });

  it('422 for invalid query values, FastAPI shaped', async () => {
    expect((await call('/api/v1/transactions?limit=0')).status).toBe(422);
    expect((await call('/api/v1/transactions?limit=201')).status).toBe(422);
    expect((await call('/api/v1/transactions?offset=-1')).status).toBe(422);
    expect((await call('/api/v1/transactions?category_id=nope')).status).toBe(422);
    const res = await call('/api/v1/transactions?from=yesterday');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: [{ type: 'datetime_parsing', loc: ['query', 'from'], msg: 'Input should be a valid datetime or date' }] });
    expect(stub.calls).toHaveLength(0);
  });

  it('400 for an unknown timezone when day summaries are requested', async () => {
    const res = await call('/api/v1/transactions?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&timezone=Mars/Base');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Invalid timezone: 'Mars/Base'" });
  });
});

describe('C7 signed media URLs', () => {
  const PRIVATE_KEY = 'receipts/u/receipts/2026-10-04/1-aa.jpg';
  const VOICE_KEY = 'voice_inputs/u/voice_inputs/2026-10-04/1-bb.m4a';

  /** Signed Worker links: `<origin>/media/<key>?exp=<unix>&sig=<hex>`, 6 h TTL. */
  const expectSigned = (value: unknown, key: string) => {
    const link = new URL(String(value));
    expect(link.protocol).toBe('https:');
    expect(link.pathname).toBe(`/media/${key}`);
    expect(Number(link.searchParams.get('exp')) - Date.now() / 1000).toBeGreaterThan(21_590);
    expect(link.searchParams.get('sig')).toMatch(/^[0-9a-f]{64}$/);
  };

  it('signs locally (no outbound calls), including legacy Supabase URLs, and signs detail too', async () => {
    const legacy = 'https://test-project.supabase.co/storage/v1/object/public/Dime/receipts/u/old.jpg';
    await seedFood();
    const at = (n: number) => `2026-10-04T10:00:0${n}.000Z`;
    await seedTx({ id: 'a0000000-0000-4000-8000-000000000001', transaction_at: at(4), receipt_url: PRIVATE_KEY, voice_url: VOICE_KEY });
    await seedTx({ id: 'a0000000-0000-4000-8000-000000000002', transaction_at: at(3), receipt_url: legacy });
    await seedTx({ id: 'a0000000-0000-4000-8000-000000000003', transaction_at: at(2), receipt_url: PRIVATE_KEY }); // duplicate ref: same link
    await seedTx({ id: 'a0000000-0000-4000-8000-000000000004', transaction_at: at(1), receipt_url: 'https://evil.example.com/x.jpg' }); // unusable: null

    const body = await (await call('/api/v1/transactions')).json<{ items: Record<string, unknown>[] }>();
    expectSigned(body.items[0]?.['receipt_url'], PRIVATE_KEY);
    expectSigned(body.items[0]?.['voice_url'], VOICE_KEY);
    expectSigned(body.items[1]?.['receipt_url'], 'receipts/u/old.jpg');
    expect(new URL(String(body.items[2]?.['receipt_url'])).pathname).toBe(`/media/${PRIVATE_KEY}`);
    expect(body.items[3]?.['receipt_url']).toBeNull();
    expect(stub.calls).toHaveLength(0);
  });

  it('missing MEDIA_URL_SECRET yields null URLs instead of failing the response', async () => {
    await seedFood();
    await seedTx({ receipt_url: 'receipts/u/a.jpg' });
    const res = await call(`/api/v1/transactions/${TX}`, { env: makeEnv({ MEDIA_URL_SECRET: '' }) });
    expect(res.status).toBe(200);
    expect((await res.json<Record<string, unknown>>())['receipt_url']).toBeNull();
  });
});

describe('GET /transactions/{id}', () => {
  it('returns the active owned transaction with payment_hash', async () => {
    await seedFood();
    await seedTx({ payment_hash: 'h1', category_id: CAT });
    const res = await call(`/api/v1/transactions/${TX.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: TX, payment_hash: 'h1', deleted_at: null, category: 'Food' });
  });

  it('404 when missing, deleted or owned by someone else', async () => {
    const res = await call(`/api/v1/transactions/${TX}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Transaction not found.' });
    await seedTx({ deleted_at: '2026-10-05T00:00:00.000Z' });
    expect((await call(`/api/v1/transactions/${TX}`)).status).toBe(404);
    await seedUser('99999999-9999-9999-9999-999999999999');
    await seedTx({ id: CAT2, user_id: '99999999-9999-9999-9999-999999999999' });
    expect((await call(`/api/v1/transactions/${CAT2}`)).status).toBe(404);
  });

  it('422 for a malformed id (loc path) and /home is not captured as an id', async () => {
    const res = await call('/api/v1/transactions/not-a-uuid');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: [{ type: 'uuid_parsing', loc: ['path', 'id'], msg: 'Input should be a valid UUID' }] });
    expect((await call('/api/v1/transactions/home')).status).toBe(422); // missing timezone, not a uuid error
  });
});

describe('GET /transactions/month-summary', () => {
  it('uses the half-open month in the user timezone', async () => {
    await seedFood();
    await seedTransaction({ amount: '600', type: 'credit', transaction_at: '2026-11-30T18:30:00.000Z' }); // first instant of December IST
    await seedTransaction({ amount: '400', type: 'credit', transaction_at: '2026-12-15T00:00:00.000Z' });
    await seedTransaction({ amount: '200', type: 'debit', category_id: CAT, transaction_at: '2026-12-20T00:00:00.000Z' });
    await seedTransaction({ amount: '50.50', type: 'debit', transaction_at: '2026-12-31T18:29:59.999Z' }); // last instant
    await seedTransaction({ amount: '777', type: 'debit', transaction_at: '2026-12-31T18:30:00.000Z' }); // January
    await seedTransaction({ amount: '777', type: 'debit', transaction_at: '2026-11-30T18:29:59.999Z' }); // November
    await seedTransaction({ amount: '777', type: 'debit', transaction_at: '2026-12-10T00:00:00.000Z', deleted_at: '2026-12-11T00:00:00.000Z' });
    const res = await call(`/api/v1/transactions/month-summary?year=2026&month=12&${TZ}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      credit_total: '1000.00',
      debit_total: '250.50',
      net: '749.50',
      transaction_count: 4,
      debit_by_category: { [CAT]: '200.00', __uncategorized__: '50.50' },
      category_meta: [{ id: CAT, name: 'Food', icon_name: 'Utensils', color: '#111111' }],
    });
  });

  it('sums cents exactly', async () => {
    await seedFood();
    await seedTransaction({ amount: '10.10', type: 'debit', category_id: CAT, transaction_at: '2026-02-05T00:00:00.000Z' });
    await seedTransaction({ amount: '5.05', type: 'debit', transaction_at: '2026-02-06T00:00:00.000Z' });
    await seedTransaction({ amount: '20', type: 'credit', category_id: CAT, transaction_at: '2026-02-07T00:00:00.000Z' });
    const body = await (await call(`/api/v1/transactions/month-summary?year=2026&month=2&timezone=UTC`)).json<Record<string, unknown>>();
    expect(body).toEqual({
      credit_total: '20.00',
      debit_total: '15.15',
      net: '4.85',
      transaction_count: 3,
      debit_by_category: { [CAT]: '10.10', __uncategorized__: '5.05' },
      category_meta: [{ id: CAT, name: 'Food', icon_name: 'Utensils', color: '#111111' }],
    });
  });

  it('returns meta for recurring-scoped categories too, and none for unknown ids', async () => {
    await seedCategory({ id: CAT2, name: 'Subscriptions', icon_name: 'Repeat', color: '#222222', scope: 'recurring_expense', user_id: USER_ID });
    await seedTransaction({ amount: '99', type: 'debit', category_id: CAT2, transaction_at: '2026-02-05T00:00:00.000Z' });
    const body = await (await call(`/api/v1/transactions/month-summary?year=2026&month=2&timezone=UTC`)).json<Record<string, unknown>>();
    expect(body['debit_by_category']).toEqual({ [CAT2]: '99.00' });
    expect(body['category_meta']).toEqual([{ id: CAT2, name: 'Subscriptions', icon_name: 'Repeat', color: '#222222' }]);
    const empty = await (await call(`/api/v1/transactions/month-summary?year=2026&month=3&timezone=UTC`)).json<Record<string, unknown>>();
    expect(empty['category_meta']).toEqual([]);
  });

  it('validation: 422 for year/month ranges and missing timezone, 400 for an unknown timezone', async () => {
    expect((await call(`/api/v1/transactions/month-summary?year=1999&month=1&${TZ}`)).status).toBe(422);
    expect((await call(`/api/v1/transactions/month-summary?year=2026&month=13&${TZ}`)).status).toBe(422);
    const missing = await call('/api/v1/transactions/month-summary?year=2026&month=1');
    expect(missing.status).toBe(422);
    expect(await missing.json()).toEqual({ detail: [{ type: 'missing', loc: ['query', 'timezone'], msg: 'Field required' }] });
    const bad = await call('/api/v1/transactions/month-summary?year=2026&month=1&timezone=Mars/Base');
    expect(bad.status).toBe(400);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('GET /transactions/home', () => {
  it('assembles today, month, top categories, recent rows and a 7 day series', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-04T20:00:00Z')); // already Oct 5 in Kolkata
    await seedFood();
    await seedCategory({ id: CAT2, name: 'Trips', icon_name: 'Plane', color: '#222222', user_id: USER_ID });
    await seedTransaction({ amount: '500', category_id: CAT, transaction_at: '2026-10-01T05:00:00.000Z' });
    await seedTransaction({ amount: '300', category_id: CAT2, transaction_at: '2026-10-03T05:00:00.000Z' });
    await seedTransaction({ amount: '100', category_id: null, transaction_at: '2026-10-04T20:00:00.000Z' }); // Oct 5 IST = today
    await seedTransaction({ amount: '10', type: 'credit', transaction_at: '2026-10-04T19:00:00.000Z' });
    await seedTransaction({ amount: '999', transaction_at: '2026-10-02T05:00:00.000Z', deleted_at: '2026-10-02T06:00:00.000Z' });
    await seedTransaction({ amount: '999', transaction_at: '2026-09-28T00:00:00.000Z' }); // September, before the 7 day window

    const res = await call(`/api/v1/transactions/home?${TZ}`);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body['spent_today']).toBe('100.00');
    expect(body['spent_this_month']).toBe('900.00');
    expect(body['top_categories']).toEqual([
      { category_id: CAT, name: 'Food', icon_name: 'Utensils', color: '#111111', total: '500.00' },
      { category_id: CAT2, name: 'Trips', icon_name: 'Plane', color: '#222222', total: '300.00' },
      { category_id: null, name: 'Uncategorized', icon_name: 'Package', color: null, total: '100.00' },
    ]);
    expect(body['last_7_days_spend']).toEqual([
      { date: '2026-09-29', total: '0' },
      { date: '2026-09-30', total: '0' },
      { date: '2026-10-01', total: '500.00' },
      { date: '2026-10-02', total: '0' },
      { date: '2026-10-03', total: '300.00' },
      { date: '2026-10-04', total: '0' },
      { date: '2026-10-05', total: '100.00' },
    ]);
    const recent = body['recent_transactions'] as { transaction_at: string }[];
    expect(recent).toHaveLength(5);
    expect(recent[0]?.transaction_at).toBe('2026-10-04T20:00:00.000Z');
  });

  it('400 for an unknown timezone, 422 for a missing one', async () => {
    expect((await call('/api/v1/transactions/home?timezone=Mars/Base')).status).toBe(400);
    expect((await call('/api/v1/transactions/home')).status).toBe(422);
  });
});

describe('GET /transactions/month-insights', () => {
  it('builds the insights payload from daily totals, payee totals and the top debits', async () => {
    await seedFood();
    const swiggy = await seedTransaction({ amount: '100', type: 'debit', counterparty_name: 'Swiggy', category_id: CAT, transaction_at: '2026-05-15T10:00:00.000Z' });
    await seedTransaction({ amount: '50', type: 'credit', counterparty_name: 'Boss', transaction_at: '2026-05-15T11:00:00.000Z' });
    await seedTransaction({ amount: '50', type: 'debit', counterparty_name: 'Uber', transaction_at: '2026-05-20T11:00:00.000Z' });
    await seedTransaction({ amount: '777', type: 'debit', counterparty_name: 'April', transaction_at: '2026-04-30T18:29:00.000Z' });

    const res = await call('/api/v1/transactions/month-insights?year=2026&month=5&timezone=Asia/Kolkata');
    expect(res.status).toBe(200);
    const body = await res.json<InsightsBody>();
    expect(body.year).toBe(2026);
    expect(body.month).toBe(5);
    expect(body.summary).toEqual({ credit_total: '50.00', debit_total: '150.00', net: '-100.00', transaction_count: 3 });
    expect(body.daily_cashflow).toHaveLength(31);
    expect(body.daily_cashflow[14]).toEqual({ date: '2026-05-15', debit_total: '100.00', credit_total: '50.00' });
    expect(body.daily_cashflow[0]).toEqual({ date: '2026-05-01', debit_total: '0', credit_total: '0' });
    expect(body.counterparty_spend).toEqual([
      { payee_key: 'swiggy', display_name: 'Swiggy', debit_total: '100.00', share: 0.6667, transaction_count: 1 },
      { payee_key: 'uber', display_name: 'Uber', debit_total: '50.00', share: 0.3333, transaction_count: 1 },
    ]);
    expect(body.counterparty_income).toEqual([{ payee_key: 'boss', display_name: 'Boss', credit_total: '50.00', share: 1, transaction_count: 1 }]);
    expect(body.top_expenses).toHaveLength(2); // the two debits of the month, largest first
    expect(body.top_expenses[0]).toMatchObject({ id: swiggy, category: 'Food' });
    expect(body.top_expenses[1]).toMatchObject({ counterparty_name: 'Uber' });
  });

  it('groups payees by payee key: display name of the oldest named row, "Unknown" when nameless', async () => {
    await seedTransaction({ amount: '10', counterparty_name: 'SWIGGY-INDIA', counterparty_normalized: null, transaction_at: '2026-05-03T00:00:00.000Z' });
    await seedTransaction({ amount: '5', counterparty_name: 'Swiggy India', counterparty_normalized: 'swiggy india', transaction_at: '2026-05-01T00:00:00.000Z' });
    await seedTransaction({ amount: '7', counterparty_name: null, counterparty_normalized: null, transaction_at: '2026-05-02T00:00:00.000Z' });
    const body = await (await call('/api/v1/transactions/month-insights?year=2026&month=5&timezone=UTC')).json<InsightsBody>();
    expect(body.counterparty_spend).toEqual([
      { payee_key: 'swiggy india', display_name: 'Swiggy India', debit_total: '15.00', share: 0.6818, transaction_count: 2 },
      { payee_key: 'unknown', display_name: 'Unknown', debit_total: '7.00', share: 0.3182, transaction_count: 1 },
    ]);
    expect(body.counterparty_income).toEqual([]);
  });
});

const createBody = (over: Record<string, unknown> = {}) => ({
  amount: '250.5',
  type: 'credit',
  counterparty_name: ' Acme Corp ',
  transaction_at: '2026-10-04T10:00:00+05:30',
  ...over,
});
const postTx = (jsonBody: unknown, extra: { headers?: Record<string, string>; tz?: string; env?: Bindings } = {}, ctx?: ExecutionContext) =>
  call(
    `/api/v1/transactions?timezone=${encodeURIComponent(extra.tz ?? 'Asia/Kolkata')}`,
    { method: 'POST', json: jsonBody, ...(extra.headers ? { headers: extra.headers } : {}), ...(extra.env ? { env: extra.env } : {}) },
    ctx,
  );
/** The payment hash POST /transactions computes for `createBody()` (or a debit variant). */
const hashFor = (over: { amount?: string; type?: string; at?: string } = {}) =>
  buildPaymentHash({
    amount: over.amount ?? '250.50',
    type: over.type ?? 'credit',
    counterpartyNormalized: 'acme corp',
    counterpartyName: 'Acme Corp',
    transactionAtMs: Date.parse(over.at ?? '2026-10-04T10:00:00+05:30'),
  });

describe('POST /transactions: size limits', () => {
  it('422 for an amount with more than 10 whole digits; 10 are fine', async () => {
    expect((await postTx(createBody({ amount: '12345678901' }))).status).toBe(422);
    expect((await postTx(createBody({ amount: '1234567890.50' }))).status).toBe(201);
  });

  it('413 for a JSON body over 64 KB', async () => {
    const res = await postTx(createBody({ note: 'x'.repeat(70 * 1024) }));
    expect(res.status).toBe(413);
  });
});

describe('POST /transactions', () => {
  it('inserts a manual transaction, ignores server-only fields (S7) and answers 201 {accepted}', async () => {
    await seedCategory({ id: CAT, name: 'Salary', user_id: USER_ID });
    const res = await postTx(
      createBody({
        category: ' salary ',
        note: ' monthly ',
        counterparty_type: 'person',
        detected_via: 'sms',
        receipt_url: 'https://evil.example.com/r.jpg',
        voice_url: 'x',
        user_id: 'someone-else',
      }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });

    const rows = await rowsOf<Record<string, unknown>>('transactions');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      user_id: USER_ID,
      amount: 25050,
      type: 'credit',
      note: 'monthly',
      detected_via: 'manual',
      transaction_at: '2026-10-04T04:30:00.000Z',
      created_at: expect.stringMatching(/Z$/) as unknown,
      updated_at: expect.stringMatching(/Z$/) as unknown,
      deleted_at: null,
      category_id: CAT,
      receipt_url: null,
      voice_url: null,
      counterparty_name: 'Acme Corp',
      counterparty_type: 'person',
      counterparty_normalized: 'acme corp',
      payment_hash: await hashFor(),
      payee_key: 'acme corp',
      recurring_item_id: null,
    });
  });

  it('accepts a numeric amount (C6) and resolves a category by id without a name', async () => {
    expect((await postTx(createBody({ amount: 12.5, category_id: INCOME }))).status).toBe(201);
    expect(await oneRow('transactions', "type = 'credit'")).toMatchObject({ amount: 1250, category_id: INCOME });
    // A category id the user cannot see is dropped, like an unknown category name.
    await seedUser('99999999-9999-9999-9999-999999999999');
    await seedCategory({ id: CAT2, name: 'Theirs', user_id: '99999999-9999-9999-9999-999999999999' });
    expect((await postTx(createBody({ amount: 13, category_id: CAT2, category: 'nope' }))).status).toBe(201);
    expect(await oneRow('transactions', 'amount = 1300')).toMatchObject({ category_id: null });
  });

  it('a hash hit sparse-merges missing fields into the existing row and inserts nothing', async () => {
    await seedCategory({ id: CAT, name: 'Salary', user_id: USER_ID });
    await seedTx({
      type: 'credit',
      amount: '250.50',
      counterparty_name: 'Acme Corp',
      counterparty_normalized: 'acme corp',
      note: null,
      category_id: null,
      counterparty_type: null,
      payment_hash: await hashFor(),
    });
    const res = await postTx(createBody({ note: 'late', category: 'Salary', counterparty_type: 'person' }));
    expect(res.status).toBe(201);
    expect(await rowsOf('transactions')).toHaveLength(1);
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ category_id: CAT, note: 'late', counterparty_type: 'person' });
  });

  it('a hash hit with nothing new to merge is a no-op', async () => {
    await seedFood();
    await seedTx({
      type: 'credit',
      amount: '250.50',
      counterparty_name: 'Acme Corp',
      counterparty_normalized: 'acme corp',
      note: 'x',
      category_id: CAT,
      counterparty_type: 'merchant',
      payment_hash: await hashFor(),
      updated_at: '2026-10-04T10:00:05.123Z',
    });
    expect((await postTx(createBody())).status).toBe(201);
    expect(await rowsOf('transactions')).toHaveLength(1);
    expect((await oneRow<{ updated_at: string }>('transactions', 'id = ?', TX))?.updated_at).toBe('2026-10-04T10:00:05.123Z');
  });

  it('a soft-deleted twin does not block a new insert (partial unique index)', async () => {
    await seedTx({
      type: 'credit',
      amount: '250.50',
      counterparty_name: 'Acme Corp',
      counterparty_normalized: 'acme corp',
      payment_hash: await hashFor(),
      deleted_at: '2026-10-05T00:00:00.000Z',
    });
    expect((await postTx(createBody())).status).toBe(201);
    expect(await rowsOf('transactions')).toHaveLength(2);
  });

  it('two concurrent identical requests create one row (the loser resolves to the winner, both 201)', async () => {
    const [a, b] = await Promise.all([postTx(createBody()), postTx(createBody())]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(await rowsOf('transactions')).toHaveLength(1);
  });

  it('other database failures surface as 500 (C8)', async () => {
    const res = await postTx(createBody(), { env: { ...makeEnv(), DB: failingOn(/INSERT INTO transactions/, 'D1_ERROR: connection failure') } as unknown as Bindings });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ detail: 'Internal error' });
    expect(await rowsOf('transactions')).toHaveLength(0);
  });

  it('validation: FastAPI-shaped 422s and a 400 for an unknown timezone, before anything is written', async () => {
    const noTz = await call('/api/v1/transactions', { method: 'POST', json: createBody() });
    expect(noTz.status).toBe(422);
    expect(await noTz.json()).toEqual({ detail: [{ type: 'missing', loc: ['query', 'timezone'], msg: 'Field required' }] });

    const bad = await postTx({ amount: '0', type: 'debit', counterparty_name: 'x', transaction_at: 'nope' });
    expect(bad.status).toBe(422);
    const detailItems = (await bad.json<{ detail: { type: string; loc: unknown[] }[] }>()).detail;
    expect(detailItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'greater_than', loc: ['body', 'amount'] }),
        expect.objectContaining({ type: 'datetime_parsing', loc: ['body', 'transaction_at'] }),
      ]),
    );

    expect((await postTx(createBody({ amount: 'abc' }))).status).toBe(422);
    expect((await postTx(createBody({ counterparty_name: '' }))).status).toBe(422);
    expect((await postTx(createBody(), { tz: 'Mars/Base' })).status).toBe(400);
    expect((await call('/api/v1/transactions?timezone=Asia/Kolkata', { method: 'POST', body: '{nope', headers: { 'content-type': 'application/json' } })).status).toBe(422);
    expect(stub.calls).toHaveLength(0);
    expect(await rowsOf('transactions')).toHaveLength(0);
  });
});

describe('POST /transactions: budget evaluation, notifications and push (background)', () => {
  const debitBody = (over: Record<string, unknown> = {}) => createBody({ type: 'debit', amount: '900', transaction_at: '2026-10-04T10:00:00+05:30', ...over });

  /** A monthly cap of 1000, a push token, and the Expo endpoint. */
  async function wire(o: { monthly?: string; categoryBudget?: string } = {}) {
    await seedBudget({ monthly: o.monthly ?? '1000' });
    await seedPushToken('ExponentPushToken[abc]');
    stub.on('POST', '/--/api/v2/push/send', () => json({ data: [{ status: 'ok' }] }));
  }

  const dedupeKeys = async () => (await rowsOf<{ dedupe_key: string }>('notifications')).map((n) => n.dedupe_key);

  it('responds first; the monthly warn notification and its push run via waitUntil', async () => {
    await wire();
    const { ctx, flush } = makeCtx();
    const res = await postTx(debitBody(), {}, ctx);
    expect(res.status).toBe(201);
    await flush();

    const rows = await rowsOf<Record<string, unknown>>('notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: USER_ID,
      kind: 'budget_threshold',
      title: '80% of monthly budget used',
      body: "You've spent ₹900 of ₹1,000 this month.",
      action_type: 'home',
      action_transaction_id: null,
      dedupe_key: 'budget:monthly:80:2026-10',
    });
    const push = stub.last('POST', '/--/api/v2/push/send');
    expect((push.body as Record<string, unknown>[])[0]).toMatchObject({
      to: 'ExponentPushToken[abc]',
      title: '80% of monthly budget used',
      body: "You've spent ₹900 of ₹1,000 this month.",
    });
  });

  it('without waitUntil support the work still runs detached and the response is unaffected', async () => {
    await wire();
    const res = await postTx(debitBody()); // no ExecutionContext
    expect(res.status).toBe(201);
    await vi.waitFor(async () => expect(await rowsOf('notifications')).toHaveLength(1));
  });

  it('emits only "over" when one debit crosses both thresholds, and no push when the insert conflicts (deduped)', async () => {
    await wire();
    await seedNotification({ dedupe_key: 'budget:monthly:80:2026-10' });
    await seedNotification({ dedupe_key: 'budget:monthly:100:2026-10' });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody({ amount: '1200' }), {}, ctx);
    await flush();
    expect(await dedupeKeys()).toEqual(['budget:monthly:80:2026-10', 'budget:monthly:100:2026-10']);
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(0);

    // Fresh keys: only the highest threshold fires (one push).
    await testDb().prepare('DELETE FROM notifications').run();
    const next = makeCtx();
    await postTx(debitBody({ amount: '1200', counterparty_name: 'Another' }), {}, next.ctx);
    await next.flush();
    expect(await dedupeKeys()).toEqual(['budget:monthly:100:2026-10']);
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(1);
  });

  it('checks the category budget first when the transaction has a category', async () => {
    await wire();
    await seedFood();
    await seedCategoryBudget(CAT, '500');
    await seedTransaction({ amount: '450', type: 'debit', category_id: null, counterparty_name: 'Earlier', transaction_at: '2026-10-01T10:00:00.000Z' });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody({ amount: '450', category_id: CAT }), {}, ctx);
    await flush();
    const posted = await rowsOf<{ dedupe_key: string; title: string; body: string }>('notifications');
    expect(posted[0]).toMatchObject({
      dedupe_key: `budget:category:${CAT}:80:2026-10`,
      title: '80% of Food budget used',
      body: "You've spent ₹450 of ₹500 on Food this month.",
    });
    expect(posted[1]?.dedupe_key).toBe('budget:monthly:80:2026-10');
  });

  it('respects alert settings: scope disabled, device notifications off', async () => {
    await wire();
    await seedSettings({ budget_monthly_alerts_enabled: 0 });
    const first = makeCtx();
    await postTx(debitBody(), {}, first.ctx);
    await first.flush();
    expect(await rowsOf('notifications')).toHaveLength(0);

    await testDb().prepare('UPDATE user_settings SET budget_monthly_alerts_enabled = 1, device_notifications_enabled = 0').run();
    await testDb().prepare('DELETE FROM transactions').run();
    const second = makeCtx();
    await postTx(debitBody(), {}, second.ctx);
    await second.flush();
    expect(await dedupeKeys()).toEqual(['budget:monthly:80:2026-10']); // notification row still created
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(0); // but no push
  });

  it('uses the user warn percentage in the dedupe key', async () => {
    await wire();
    await seedSettings({ budget_monthly_warn_pct: 70 });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody({ amount: '750' }), {}, ctx);
    await flush();
    expect(await dedupeKeys()).toEqual(['budget:monthly:70:2026-10']);
  });

  it('credits do no notification work at all', async () => {
    await wire();
    const { ctx, flush } = makeCtx();
    await postTx(createBody(), {}, ctx);
    await flush();
    expect(await rowsOf('notifications')).toHaveLength(0);
    expect(await rowsOf('user_settings')).toHaveLength(0);
  });

  it('a duplicate (hash hit) does no notification work', async () => {
    await wire();
    await seedFood();
    await seedTx({
      type: 'debit',
      amount: '900',
      counterparty_name: 'Acme Corp',
      counterparty_normalized: 'acme corp',
      note: 'x',
      category_id: CAT,
      counterparty_type: 'merchant',
      payment_hash: await hashFor({ amount: '900.00', type: 'debit' }),
    });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody(), {}, ctx);
    await flush();
    expect(await rowsOf('notifications')).toHaveLength(0);
  });

  it('a failing background evaluation never fails the response', async () => {
    await wire();
    const env = { ...makeEnv(), DB: failingOn(/user_settings/, 'D1_ERROR: db down') } as unknown as Bindings;
    const { ctx, flush } = makeCtx();
    const res = await postTx(debitBody(), { env }, ctx);
    expect(res.status).toBe(201);
    await expect(flush()).resolves.toBeDefined();
    expect(await rowsOf('transactions')).toHaveLength(1);
  });
});

describe('POST /transactions: Idempotency-Key (C2)', () => {
  const withKey = { headers: { 'Idempotency-Key': KEY } };
  const jobsOfKey = () => rowsOf<Record<string, unknown>>('jobs', 'idempotency_key = ?', KEY);
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  it('claims the key with a manual_create job, creates once and stores the response', async () => {
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });
    const jobs = await jobsOfKey();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      user_id: USER_ID,
      kind: 'manual_create',
      payload: '{}',
      status: 'done',
      attempts: 1,
      idempotency_key: KEY,
      result: JSON.stringify({ status_code: 201, body: { accepted: true } }),
    });
    expect(await rowsOf('transactions')).toHaveLength(1);
    // The same key again replays and creates nothing.
    expect(await (await postTx(createBody(), withKey)).json()).toEqual({ accepted: true });
    expect(await rowsOf('transactions')).toHaveLength(1);
  });

  it('replays the stored response without creating anything', async () => {
    await seedJob({ kind: 'manual_create', status: 'done', idempotency_key: KEY, result: { status_code: 201, body: { accepted: true } } });
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });
    expect(await rowsOf('transactions')).toHaveLength(0);
  });

  it('replays a done row whose result lacks a body as 201 {accepted: true}', async () => {
    await seedJob({ kind: 'manual_create', status: 'done', idempotency_key: KEY, result: null });
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });
  });

  it('409 while the first request is still processing', async () => {
    await seedJob({ kind: 'manual_create', status: 'processing', idempotency_key: KEY, updated_at: minutesAgo(1) });
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ detail: 'A request with this Idempotency-Key is still being processed.' });
    expect(await rowsOf('transactions')).toHaveLength(0);
    expect((await jobsOfKey())[0]).toMatchObject({ status: 'processing' });
  });

  it('re-claims a failed row with a conditional update and runs the action again', async () => {
    await seedJob({ kind: 'manual_create', status: 'failed', idempotency_key: KEY, attempts: 1 });
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await jobsOfKey()).toHaveLength(1);
    expect((await jobsOfKey())[0]).toMatchObject({ status: 'done' });
    expect(await rowsOf('transactions')).toHaveLength(1);
  });

  it('re-claims a processing row only after 600 seconds', async () => {
    await seedJob({ kind: 'manual_create', status: 'processing', idempotency_key: KEY, updated_at: minutesAgo(9) });
    expect((await postTx(createBody(), withKey)).status).toBe(409);
    await testDb().prepare('UPDATE jobs SET updated_at = ?').bind(minutesAgo(11)).run();
    expect((await postTx(createBody(), withKey)).status).toBe(201);
    expect((await jobsOfKey())[0]).toMatchObject({ status: 'done' });
    expect(await rowsOf('transactions')).toHaveLength(1);
  });

  it('a failing action marks the job failed with last_error and propagates the error', async () => {
    const env = { ...makeEnv(), DB: failingOn(/INSERT INTO transactions/, 'D1_ERROR: connection failure') } as unknown as Bindings;
    const res = await postTx(createBody(), { ...withKey, env });
    expect(res.status).toBe(500);
    const job = (await jobsOfKey())[0];
    expect(job?.['status']).toBe('failed');
    expect(String(job?.['last_error'])).toContain('connection failure');
    expect(String(job?.['last_error']).length).toBeLessThanOrEqual(500);
  });

  it('a malformed key is a 422 and nothing is touched; a blank key means no idempotency', async () => {
    const bad = await postTx(createBody(), { headers: { 'Idempotency-Key': 'short' } });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ detail: "Invalid Idempotency-Key (use a UUID or 8-100 chars of letters, digits, '-', '_', '.')." });
    expect(await rowsOf('jobs')).toHaveLength(0);
    expect(await rowsOf('transactions')).toHaveLength(0);

    expect((await postTx(createBody(), { headers: { 'Idempotency-Key': '   ' } })).status).toBe(201);
    expect(await rowsOf('jobs')).toHaveLength(0);
  });
});

describe('PATCH /transactions/{id}', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    amount: 250.5,
    type: 'credit',
    counterparty_name: ' New Payee ',
    counterparty_type: 'person',
    category: 'Income',
    category_id: INCOME,
    note: 'fixed',
    transaction_at: '2026-08-02T12:00:00Z',
    ...over,
  });
  const patchTx = (jsonBody: unknown, id = TX) => call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: jsonBody });
  const newHash = () =>
    buildPaymentHash({ amount: '250.50', type: 'credit', counterpartyNormalized: 'new payee', counterpartyName: 'New Payee', transactionAtMs: Date.parse('2026-08-02T12:00:00Z') });

  it('writes the editable fields, recomputes the hash and returns the enriched row', async () => {
    await seedFood();
    await seedTx({ payment_hash: 'keep-me' });
    const res = await patchTx(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: TX, amount: '250.50', type: 'credit', category: 'Income', category_icon_name: 'TrendingUp', merchant: 'New Payee' });
    const row = await oneRow<Record<string, unknown>>('transactions', 'id = ?', TX);
    expect(row).toMatchObject({
      amount: 25050,
      type: 'credit',
      note: 'fixed',
      transaction_at: '2026-08-02T12:00:00.000Z',
      category_id: INCOME,
      counterparty_name: 'New Payee',
      counterparty_normalized: 'new payee',
      counterparty_type: 'person',
      payee_key: 'new payee',
      payment_hash: await newHash(),
      user_id: USER_ID,
    });
    expect(String(row?.['updated_at']) > '2026-10-04T10:00:05.123Z').toBe(true);
  });

  it('keeps the hash stable when the fingerprint is unchanged', async () => {
    await seedFood();
    await seedTx({ payment_hash: 'keep-me' });
    await patchTx(body());
    const hash = (await oneRow<{ payment_hash: string }>('transactions', 'id = ?', TX))?.payment_hash;
    expect((await patchTx(body({ note: 'second edit' }))).status).toBe(200);
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ payment_hash: hash, note: 'second edit' });
  });

  it('409 when the edit matches another active transaction', async () => {
    await seedFood();
    await seedTx({ payment_hash: 'keep-me' });
    await seedTransaction({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', payment_hash: await newHash() });
    const res = await patchTx(body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ detail: 'Another transaction already has the same amount, payee, type and time.' });
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ amount: 48000, payment_hash: 'keep-me' });
  });

  it('a soft-deleted row with the same fingerprint is not a clash', async () => {
    await seedFood();
    await seedTx({ payment_hash: 'keep-me' });
    await seedTransaction({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', payment_hash: await newHash(), deleted_at: '2026-10-05T00:00:00.000Z' });
    expect((await patchTx(body())).status).toBe(200);
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ payment_hash: await newHash() });
  });

  it('a legacy row without a hash that would clash keeps its hash unset (200)', async () => {
    await seedFood();
    await seedTx({ payment_hash: null });
    await seedTransaction({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', payment_hash: await newHash() });
    expect((await patchTx(body())).status).toBe(200);
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ payment_hash: null, amount: 25050 });
  });

  it('two concurrent edits to the same fingerprint: one wins, the other is a 409 (unique index)', async () => {
    await seedFood();
    await seedTx({ payment_hash: 'keep-me' });
    const other = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await seedTransaction({ id: other, payment_hash: 'other-hash' });
    const statuses = (await Promise.all([patchTx(body()), patchTx(body(), other)])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('clears the category when none resolves (matches Python) and keeps counterparty_type when absent', async () => {
    await seedFood();
    await seedTx({ payment_hash: null, counterparty_type: 'person' });
    await patchTx(body({ category: 'Nope', category_id: undefined, counterparty_type: undefined }));
    expect(await oneRow('transactions', 'id = ?', TX)).toMatchObject({ category_id: null, counterparty_type: 'person' });
  });

  it('404 when the transaction is missing, deleted or owned by someone else', async () => {
    const res = await patchTx(body());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Transaction not found.' });
    await seedTx({ deleted_at: '2026-10-05T00:00:00.000Z' });
    expect((await patchTx(body())).status).toBe(404);
    await seedUser('99999999-9999-9999-9999-999999999999');
    await seedTx({ id: CAT2, user_id: '99999999-9999-9999-9999-999999999999' });
    expect((await patchTx(body(), CAT2)).status).toBe(404);
    expect(await oneRow('transactions', 'id = ?', CAT2)).toMatchObject({ amount: 48000 });
  });

  it('422 for a malformed id or body', async () => {
    expect((await patchTx(body(), 'nope')).status).toBe(422);
    expect((await patchTx({ ...body(), amount: '-1' })).status).toBe(422);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('DELETE /transactions/{id}', () => {
  it('soft deletes an active owned row (204, empty body)', async () => {
    await seedTx();
    const res = await call(`/api/v1/transactions/${TX}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    const row = await oneRow<{ deleted_at: string; updated_at: string }>('transactions', 'id = ?', TX);
    expect(Date.parse(row?.deleted_at ?? '')).toBeGreaterThan(Date.now() - 5000);
    expect(row?.updated_at).toBe(row?.deleted_at);
    expect((await call(`/api/v1/transactions/${TX}`)).status).toBe(404);
  });

  it('404 when nothing was updated; 422 for a bad id', async () => {
    const res = await call(`/api/v1/transactions/${TX}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Transaction not found.' });
    await seedTx({ deleted_at: '2026-10-05T00:00:00.000Z' });
    expect((await call(`/api/v1/transactions/${TX}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call('/api/v1/transactions/x', { method: 'DELETE' })).status).toBe(422);
  });

  it('another user cannot delete: the query is always scoped to the JWT user', async () => {
    await seedTx();
    const other = await signToken({ sub: '99999999-9999-9999-9999-999999999999' });
    const res = await call(`/api/v1/transactions/${TX}`, { method: 'DELETE', token: other });
    expect(res.status).toBe(404);
    expect((await oneRow<{ deleted_at: string | null }>('transactions', 'id = ?', TX))?.deleted_at).toBeNull();
  });
});
