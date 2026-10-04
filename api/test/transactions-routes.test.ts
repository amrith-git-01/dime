import { afterEach, describe, expect, it, vi } from 'vitest';

import { USER_ID, call, makeCtx, signToken } from './helpers';
import { json, pgError, rows, useSupabaseStub } from './supabase-stub';
import type { RecordedCall } from './supabase-stub';

const stub = useSupabaseStub();

const TX = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAT2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const KEY = '5c0e7d9e-3b0f-4f3c-9a55-0c1d2e3f4a5b';
const TZ = 'timezone=Asia%2FKolkata';

const tx = (over: Record<string, unknown> = {}) => ({
  id: TX,
  user_id: USER_ID,
  amount: 480,
  type: 'debit',
  counterparty_name: ' Swiggy ',
  counterparty_type: 'merchant',
  counterparty_normalized: 'swiggy',
  category_id: CAT,
  note: null,
  detected_via: 'sms',
  receipt_url: null,
  voice_url: null,
  transaction_at: '2026-10-04T10:00:00+00:00',
  created_at: '2026-10-04T10:00:05.123456+00:00',
  updated_at: null,
  ...over,
});
const detail = (over: Record<string, unknown> = {}) => tx({ deleted_at: null, payment_hash: 'h1', ...over });
const cat = { id: CAT, name: ' Food ', icon_name: 'Utensils', color: '#111111', is_system: true };

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

const isTable = (c: RecordedCall, select: RegExp) => select.test(c.params.get('select') ?? '');

/** The stub answers with the FIRST matching route, so a test that needs different answers starts over. */
function resetRoutes() {
  (stub as unknown as { routes: unknown[] }).routes = [];
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
  it('lists newest first with a limit+1 probe, enriched with category display fields', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([tx()]));
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));
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
      transaction_at: '2026-10-04T10:00:00Z',
      created_at: '2026-10-04T10:00:05.123456Z',
      updated_at: '2026-10-04T10:00:05.123456Z', // falls back to created_at
      deleted_at: null,
      receipt_url: null,
      voice_url: null,
      payment_hash: null,
    });
    const q = stub.last('GET', '/rest/v1/transactions').params;
    expect(q.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(q.get('deleted_at')).toBe('is.null');
    expect(q.get('order')).toBe('transaction_at.desc,id.desc');
    expect(q.get('limit')).toBe('51');
    expect(q.get('offset')).toBe('0');
    const c = stub.last('GET', '/rest/v1/categories').params;
    expect(c.get('id')).toBe(`in.(${CAT})`);
    expect(c.get('or')).toBe(`(is_system.eq.true,user_id.eq.${USER_ID})`);
  });

  it('maps legacy detected_via/counterparty_type values', async () => {
    stub.on('GET', '/rest/v1/transactions', () =>
      rows([tx({ detected_via: 'upi', counterparty_type: null, category_id: null }), tx({ id: 'x', detected_via: '  ', counterparty_type: 'weird', counterparty_name: null })]),
    );
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));
    const body = await (await call('/api/v1/transactions')).json<{ items: Record<string, unknown>[] }>();
    expect(body.items[0]).toMatchObject({ detected_via: 'notification', counterparty_type: 'merchant', category: null, category_id: null });
    expect(body.items[1]).toMatchObject({ detected_via: null, counterparty_type: 'merchant', merchant: '', counterparty_name: null });
    expect(stub.find('GET', '/rest/v1/categories').length).toBe(1); // only the second row has a category id
  });

  it('uses a half-open [from, to) range and pages with limit/offset', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([tx(), tx({ id: 'b' }), tx({ id: 'c' })]));
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));
    const res = await call('/api/v1/transactions?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&limit=2&offset=4');
    const body = await res.json<{ items: unknown[]; has_more: boolean }>();
    expect(body.items).toHaveLength(2);
    expect(body.has_more).toBe(true);
    const q = stub.last('GET', '/rest/v1/transactions').params;
    expect(q.getAll('transaction_at')).toEqual(['gte.2026-10-01T00:00:00.000Z', 'lt.2026-11-01T00:00:00.000Z']);
    expect(q.get('limit')).toBe('3');
    expect(q.get('offset')).toBe('4');
    expect(stub.find('POST', '/rpc/')).toHaveLength(0); // offset > 0: no day summaries
  });

  it('first page of a range with a timezone also returns day summaries (daily totals RPC)', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () =>
      json([
        { day: '2026-10-01', credit_total: 100, debit_total: 235, credit_count: 1, debit_count: 2 },
        { day: '2026-10-02', credit_total: 0, debit_total: 50.5, credit_count: 0, debit_count: 1 },
      ]),
    );
    const res = await call(`/api/v1/transactions?from=2026-09-30T18:30:00Z&to=2026-10-31T18:30:00Z&${TZ}`);
    const body = await res.json<{ day_summaries: Record<string, unknown> }>();
    expect(body.day_summaries).toEqual({
      '2026-10-01': { date: '2026-10-01', credit_total: '100.00', debit_total: '235.00', net: '-135.00', transaction_count: 3 },
      '2026-10-02': { date: '2026-10-02', credit_total: '0.00', debit_total: '50.50', net: '-50.50', transaction_count: 1 },
    });
    expect(stub.last('POST', '/rpc/transactions_daily_totals').body).toEqual({
      p_user_id: USER_ID,
      p_from: '2026-09-30T18:30:00.000Z',
      p_to: '2026-10-31T18:30:00.000Z',
      p_tz: 'Asia/Kolkata',
    });
  });

  it('falls back to paging raw rows when the daily totals function is not deployed', async () => {
    stub.on('GET', '/rest/v1/transactions', (c) =>
      isTable(c, /^amount,type,transaction_at$/)
        ? rows([
            { amount: 100, type: 'credit', transaction_at: '2026-10-01T03:30:00+00:00' },
            { amount: 235, type: 'debit', transaction_at: '2026-10-01T07:30:00+00:00' },
          ])
        : rows([]),
    );
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () => pgError('PGRST202', 'Could not find the function', 404));
    const res = await call(`/api/v1/transactions?from=2026-09-30T18:30:00Z&to=2026-10-31T18:30:00Z&${TZ}`);
    expect(res.status).toBe(200);
    const body = await res.json<{ day_summaries: Record<string, { net: string }> }>();
    expect(body.day_summaries['2026-10-01']?.net).toBe('-135.00');
  });

  it('C3: category_id and payee filters; day summaries are skipped when filtering', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    const res = await call(`/api/v1/transactions?category_id=${CAT}&payee=Swiggy%20India&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&${TZ}`);
    expect(res.status).toBe(200);
    const q = stub.last('GET', '/rest/v1/transactions').params;
    expect(q.get('category_id')).toBe(`eq.${CAT}`);
    expect(q.get('or')).toBe('(counterparty_normalized.ilike."*Swiggy India*",counterparty_name.ilike."*Swiggy India*")');
    expect(stub.find('POST', '/rpc/')).toHaveLength(0);
  });

  it('ignores empty filter params', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    expect((await call('/api/v1/transactions?payee=&category_id=')).status).toBe(200);
    const q = stub.last('GET', '/rest/v1/transactions').params;
    expect(q.get('or')).toBeNull();
    expect(q.get('category_id')).toBeNull();
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
  const signedResponse = (bucket: string) => (c: RecordedCall) => {
    const paths = (c.body as { paths: string[] }).paths;
    return json(paths.map((path) => ({ error: null, path, signedURL: `/object/sign/${bucket}/${path}?token=t-${path.length}` })));
  };

  it('batch-signs once per bucket, including legacy public URLs, and signs detail too', async () => {
    const legacy = 'https://test-project.supabase.co/storage/v1/object/public/Dime/receipts/u/old.jpg';
    stub.on('GET', '/rest/v1/transactions', () =>
      rows([
        tx({ receipt_url: 'receipts/u/receipts/2026-10-04/1-aa.jpg', voice_url: 'voice_inputs/u/voice_inputs/2026-10-04/1-bb.m4a' }),
        tx({ id: 'b', receipt_url: legacy }),
        tx({ id: 'c', receipt_url: 'receipts/u/receipts/2026-10-04/1-aa.jpg' }), // duplicate ref: signed once
        tx({ id: 'd', receipt_url: 'https://evil.example.com/x.jpg' }), // unusable: null
      ]),
    );
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));
    stub.on('POST', '/storage/v1/object/sign/Dime-private', signedResponse('Dime-private'));
    stub.on('POST', '/storage/v1/object/sign/Dime', signedResponse('Dime'));

    const body = await (await call('/api/v1/transactions')).json<{ items: Record<string, unknown>[] }>();
    const url = (bucket: string, path: string) => `https://test-project.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t-${path.length}`;
    expect(body.items[0]?.['receipt_url']).toBe(url('Dime-private', 'receipts/u/receipts/2026-10-04/1-aa.jpg'));
    expect(body.items[0]?.['voice_url']).toBe(url('Dime-private', 'voice_inputs/u/voice_inputs/2026-10-04/1-bb.m4a'));
    expect(body.items[1]?.['receipt_url']).toBe(url('Dime', 'receipts/u/old.jpg'));
    expect(body.items[2]?.['receipt_url']).toBe(body.items[0]?.['receipt_url']);
    expect(body.items[3]?.['receipt_url']).toBeNull();

    const signCalls = stub.find('POST', '/storage/v1/object/sign/');
    expect(signCalls).toHaveLength(2); // one call per bucket
    const privateCall = stub.last('POST', '/storage/v1/object/sign/Dime-private');
    expect(privateCall.body).toEqual({
      expiresIn: 21600,
      paths: ['receipts/u/receipts/2026-10-04/1-aa.jpg', 'voice_inputs/u/voice_inputs/2026-10-04/1-bb.m4a'],
    });
    expect((stub.last('POST', '/storage/v1/object/sign/Dime').body as { paths: string[] }).paths).toEqual(['receipts/u/old.jpg']);
  });

  it('a storage failure yields null URLs instead of failing the response', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([detail({ receipt_url: 'receipts/u/a.jpg' })]));
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));
    stub.on('POST', '/storage/v1/object/sign/', () => json({ message: 'boom' }, { status: 500 }));
    const res = await call(`/api/v1/transactions/${TX}`);
    expect(res.status).toBe(200);
    expect((await res.json<Record<string, unknown>>())['receipt_url']).toBeNull();
  });
});

describe('GET /transactions/{id}', () => {
  it('returns the active owned transaction with payment_hash', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([detail()]));
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));
    const res = await call(`/api/v1/transactions/${TX.toUpperCase()}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: TX, payment_hash: 'h1', deleted_at: null, category: 'Food' });
    const q = stub.last('GET', '/rest/v1/transactions').params;
    expect(q.get('id')).toBe(`eq.${TX}`);
    expect(q.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(q.get('deleted_at')).toBe('is.null');
  });

  it('404 when missing, deleted or owned by someone else', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    const res = await call(`/api/v1/transactions/${TX}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Transaction not found.' });
  });

  it('422 for a malformed id (loc path) and /home is not captured as an id', async () => {
    const res = await call('/api/v1/transactions/not-a-uuid');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: [{ type: 'uuid_parsing', loc: ['path', 'id'], msg: 'Input should be a valid UUID' }] });
    expect((await call('/api/v1/transactions/home')).status).toBe(422); // missing timezone, not a uuid error
  });
});

describe('GET /transactions/month-summary', () => {
  it('uses the half-open month in the user timezone and the period summary RPC', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () =>
      json({ credit_total: 1000, debit_total: '250.5', transaction_count: 4, debit_by_category: { [CAT]: 200, '': 50.5 } }),
    );
    const res = await call(`/api/v1/transactions/month-summary?year=2026&month=12&${TZ}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      credit_total: '1000.00',
      debit_total: '250.50',
      net: '749.50',
      transaction_count: 4,
      debit_by_category: { [CAT]: '200.00', __uncategorized__: '50.50' },
    });
    expect(stub.last('POST', '/rpc/transactions_period_summary').body).toEqual({
      p_user_id: USER_ID,
      p_from: '2026-11-30T18:30:00.000Z',
      p_to: '2026-12-31T18:30:00.000Z',
    });
  });

  it('falls back to paging rows when the RPC fails', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () => pgError('42883', 'function does not exist', 404));
    stub.on('GET', '/rest/v1/transactions', () =>
      rows([
        { amount: 10.1, type: 'debit', category_id: CAT },
        { amount: 5.05, type: 'debit', category_id: null },
        { amount: 20, type: 'credit', category_id: CAT },
      ]),
    );
    const body = await (await call(`/api/v1/transactions/month-summary?year=2026&month=2&timezone=UTC`)).json<Record<string, unknown>>();
    expect(body).toEqual({
      credit_total: '20.00',
      debit_total: '15.15',
      net: '4.85',
      transaction_count: 3,
      debit_by_category: { [CAT]: '10.10', __uncategorized__: '5.05' },
    });
    const q = stub.last('GET', '/rest/v1/transactions').params;
    expect(q.getAll('transaction_at')).toEqual(['gte.2026-02-01T00:00:00.000Z', 'lt.2026-03-01T00:00:00.000Z']);
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
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () =>
      json({
        credit_total: 0,
        debit_total: 900,
        transaction_count: 9,
        debit_by_category: { [CAT]: 500, [CAT2]: 300, '': 100 },
      }),
    );
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () =>
      json([
        { day: '2026-10-03', credit_total: 0, debit_total: 40, credit_count: 0, debit_count: 1 },
        { day: '2026-10-05', credit_total: 10, debit_total: 120.5, credit_count: 1, debit_count: 2 },
      ]),
    );
    stub.on('GET', '/rest/v1/transactions', () => rows([tx()]));
    stub.on('GET', '/rest/v1/categories', () => rows([cat, { id: CAT2, name: 'Travel', icon_name: 'Plane', color: '#222222', is_system: false }]));

    const res = await call(`/api/v1/transactions/home?${TZ}`);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body['spent_today']).toBe('120.50');
    expect(body['spent_this_month']).toBe('900.00');
    expect(body['top_categories']).toEqual([
      { category_id: CAT, name: 'Food', icon_name: 'Utensils', color: '#111111', total: '500.00' },
      { category_id: CAT2, name: 'Travel', icon_name: 'Plane', color: '#222222', total: '300.00' },
      { category_id: null, name: 'Uncategorized', icon_name: 'Package', color: null, total: '100.00' },
    ]);
    expect(body['last_7_days_spend']).toEqual([
      { date: '2026-09-29', total: '0' },
      { date: '2026-09-30', total: '0' },
      { date: '2026-10-01', total: '0' },
      { date: '2026-10-02', total: '0' },
      { date: '2026-10-03', total: '40.00' },
      { date: '2026-10-04', total: '0' },
      { date: '2026-10-05', total: '120.50' },
    ]);
    expect((body['recent_transactions'] as unknown[]).length).toBe(1);

    const month = stub.find('POST', '/rpc/transactions_period_summary');
    expect(month).toHaveLength(1);
    expect(month[0]?.body).toMatchObject({ p_from: '2026-09-30T18:30:00.000Z', p_to: '2026-10-31T18:30:00.000Z' });
    expect(stub.last('POST', '/rpc/transactions_daily_totals').body).toMatchObject({
      p_from: '2026-09-28T18:30:00.000Z', // 7 local days (Sep 29 .. Oct 5) ending today
      p_to: '2026-10-05T18:30:00.000Z',
      p_tz: 'Asia/Kolkata',
    });
    expect(stub.last('GET', '/rest/v1/transactions').params.get('limit')).toBe('5');
    // One categories query serves the recent rows and the top categories together.
    const catCalls = stub.find('GET', '/rest/v1/categories');
    expect(catCalls).toHaveLength(1);
    expect([...(catCalls[0]?.params.get('id') ?? '').matchAll(/[0-9a-f-]{36}/g)].map((m) => m[0]).sort()).toEqual([CAT, CAT2]);
  });

  it('400 for an unknown timezone, 422 for a missing one', async () => {
    expect((await call('/api/v1/transactions/home?timezone=Mars/Base')).status).toBe(400);
    expect((await call('/api/v1/transactions/home')).status).toBe(422);
  });
});

describe('GET /transactions/month-insights', () => {
  it('builds the insights payload from daily totals, payee totals and the top debits', async () => {
    stub.on('POST', '/rest/v1/rpc/transactions_daily_totals', () =>
      json([
        { day: '2026-05-15', credit_total: 50, debit_total: 100, credit_count: 1, debit_count: 1 },
        { day: '2026-05-20', credit_total: 0, debit_total: 50, credit_count: 0, debit_count: 1 },
      ]),
    );
    stub.on('POST', '/rest/v1/rpc/transactions_payee_totals', () =>
      json([
        { type: 'credit', payee_key: 'boss', display_name: 'Boss', total: 50, transaction_count: 1 },
        { type: 'debit', payee_key: 'swiggy', display_name: 'Swiggy', total: 100, transaction_count: 1 },
        { type: 'debit', payee_key: 'uber', display_name: 'Uber', total: 50, transaction_count: 1 },
      ]),
    );
    stub.on('GET', '/rest/v1/transactions', () => rows([tx({ amount: 100 })]));
    stub.on('GET', '/rest/v1/categories', () => rows([cat]));

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
    expect(body.top_expenses).toHaveLength(1);
    expect(body.top_expenses[0]).toMatchObject({ id: TX, category: 'Food' });

    expect(stub.last('POST', '/rpc/transactions_daily_totals').body).toMatchObject({
      p_from: '2026-04-30T18:30:00.000Z',
      p_to: '2026-05-31T18:30:00.000Z',
    });
    const top = stub.last('GET', '/rest/v1/transactions').params;
    expect(top.get('type')).toBe('eq.debit');
    expect(top.get('order')).toBe('amount.desc,transaction_at.desc');
    expect(top.get('limit')).toBe('5');
    expect(top.getAll('transaction_at')).toEqual(['gte.2026-04-30T18:30:00.000Z', 'lt.2026-05-31T18:30:00.000Z']);
  });

  it('falls back to raw rows when the SQL functions are missing', async () => {
    stub.on('POST', '/rest/v1/rpc/', () => pgError('PGRST202', 'missing', 404));
    stub.on('GET', '/rest/v1/transactions', (c) => {
      const select = c.params.get('select') ?? '';
      if (select === 'amount,type,transaction_at') {
        return rows([
          { amount: 100, type: 'debit', transaction_at: '2026-05-15T10:00:00+00:00' },
          { amount: 50, type: 'credit', transaction_at: '2026-05-15T11:00:00+00:00' },
        ]);
      }
      if (select.startsWith('amount,type,counterparty_name')) {
        return rows([
          { amount: 100, type: 'debit', counterparty_name: 'Swiggy', counterparty_normalized: null, transaction_at: '2026-05-15T10:00:00+00:00' },
          { amount: 50, type: 'credit', counterparty_name: 'Boss', counterparty_normalized: 'boss', transaction_at: '2026-05-15T11:00:00+00:00' },
        ]);
      }
      return rows([]);
    });
    const body = await (await call('/api/v1/transactions/month-insights?year=2026&month=5&timezone=UTC')).json<InsightsBody>();
    expect(body.summary).toEqual({ credit_total: '50.00', debit_total: '100.00', net: '-50.00', transaction_count: 2 });
    expect(body.counterparty_spend).toEqual([{ payee_key: 'swiggy', display_name: 'Swiggy', debit_total: '100.00', share: 1, transaction_count: 1 }]);
    expect(body.counterparty_income[0]).toMatchObject({ payee_key: 'boss', credit_total: '50.00' });
    expect(body.top_expenses).toEqual([]);
  });
});

const createBody = (over: Record<string, unknown> = {}) => ({
  amount: '250.5',
  type: 'credit',
  counterparty_name: ' Acme Corp ',
  transaction_at: '2026-10-04T10:00:00+05:30',
  ...over,
});
const postTx = (jsonBody: unknown, extra: { headers?: Record<string, string>; tz?: string } = {}, ctx?: ExecutionContext) =>
  call(`/api/v1/transactions?timezone=${encodeURIComponent(extra.tz ?? 'Asia/Kolkata')}`, { method: 'POST', json: jsonBody, ...(extra.headers ? { headers: extra.headers } : {}) }, ctx);

describe('POST /transactions', () => {
  it('inserts a manual transaction, ignores server-only fields (S7) and answers 201 {accepted}', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('GET', '/rest/v1/categories', () => rows([{ id: CAT, name: 'Salary' }]));
    stub.on('POST', '/rest/v1/transactions', () => json([{ id: TX }], { status: 201 }));
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

    const row = stub.last('POST', '/rest/v1/transactions').body as Record<string, unknown>;
    expect(row).toEqual({
      user_id: USER_ID,
      amount: '250.50',
      type: 'credit',
      note: 'monthly',
      detected_via: 'manual',
      transaction_at: '2026-10-04T04:30:00.000Z',
      category_id: CAT,
      receipt_url: null,
      voice_url: null,
      counterparty_name: 'Acme Corp',
      counterparty_normalized: 'acme corp',
      counterparty_type: 'person',
      payment_hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
    // Dedupe lookup used the same hash, scoped to the user and to active rows.
    const lookup = stub.last('GET', '/rest/v1/transactions').params;
    expect(lookup.get('payment_hash')).toBe(`eq.${String(row['payment_hash'])}`);
    expect(lookup.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(lookup.get('deleted_at')).toBe('is.null');
  });

  it('accepts a numeric amount (C6) and skips the categories query when no category is named', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/transactions', () => json([{ id: TX }], { status: 201 }));
    expect((await postTx(createBody({ amount: 12.5 }))).status).toBe(201);
    expect((stub.last('POST', '/rest/v1/transactions').body as Record<string, unknown>)['amount']).toBe('12.50');
    expect(stub.find('GET', '/rest/v1/categories')).toHaveLength(0);
  });

  it('a hash hit sparse-merges missing fields into the existing row and inserts nothing', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([detail({ note: null, category_id: null, counterparty_type: null })]));
    stub.on('GET', '/rest/v1/categories', () => rows([{ id: CAT, name: 'Salary' }]));
    stub.on('PATCH', '/rest/v1/transactions', () => rows([detail()]));
    const res = await postTx(createBody({ note: 'late', category: 'Salary', counterparty_type: 'person' }));
    expect(res.status).toBe(201);
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(0);
    const patch = stub.last('PATCH', '/rest/v1/transactions');
    expect(patch.body).toEqual({ category_id: CAT, note: 'late', counterparty_type: 'person' });
    expect(patch.params.get('id')).toBe(`eq.${TX}`);
    expect(patch.params.get('user_id')).toBe(`eq.${USER_ID}`);
  });

  it('a hash hit with nothing new to merge is a no-op', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([detail({ note: 'x', category_id: CAT, counterparty_type: 'merchant' })]));
    expect((await postTx(createBody())).status).toBe(201);
    expect(stub.find('PATCH', '/rest/v1/transactions')).toHaveLength(0);
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(0);
  });

  it('losing the insert race to the unique index resolves to the winner (201)', async () => {
    let lookups = 0;
    stub.on('GET', '/rest/v1/transactions', () => rows(++lookups === 1 ? [] : [detail()]));
    stub.on('POST', '/rest/v1/transactions', () => pgError('23505', 'duplicate key value violates unique constraint', 409));
    expect((await postTx(createBody())).status).toBe(201);
    expect(lookups).toBe(2);
  });

  it('other insert failures surface as 500 (C8)', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/transactions', () => pgError('08006', 'connection failure', 500));
    const res = await postTx(createBody());
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ detail: 'Internal error' });
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
  });
});

describe('POST /transactions: budget evaluation, notifications and push (background)', () => {
  const debitBody = (over: Record<string, unknown> = {}) => createBody({ type: 'debit', amount: '900', transaction_at: '2026-10-04T10:00:00+05:30', ...over });
  const NEW_NOTIFICATION = { id: 'n1', kind: 'budget_threshold', title: 'T', body: 'B', action_type: 'home', action_transaction_id: null };

  interface Scenario {
    settings?: () => Response;
    debitTotal?: number;
    debitByCategory?: Record<string, number>;
    inserted?: Record<string, unknown>[];
    categoryBudget?: number | null;
  }

  function wire(o: Scenario = {}) {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/transactions', () => json([{ id: TX }], { status: 201 }));
    stub.on('GET', '/rest/v1/user_settings', o.settings ?? (() => rows([{ budget_monthly_warn_pct: 80 }])));
    stub.on('GET', '/rest/v1/budgets', () => rows([{ id: 'b', user_id: USER_ID, monthly_budget: 1000, daily_budget: 0, created_at: 'x', updated_at: 'x' }]));
    stub.on('GET', '/rest/v1/category_budgets', () => rows(o.categoryBudget == null ? [] : [{ monthly_amount: o.categoryBudget }]));
    stub.on('GET', '/rest/v1/categories', (c) =>
      c.params.get('select') === 'id,name' ? rows([{ id: CAT, name: 'Food' }]) : rows([{ id: CAT, name: 'Food', icon_name: 'x', color: 'y', is_system: true }]),
    );
    stub.on('POST', '/rest/v1/rpc/transactions_period_summary', () =>
      json({ credit_total: 0, debit_total: o.debitTotal ?? 900, transaction_count: 1, debit_by_category: o.debitByCategory ?? {} }),
    );
    stub.on('POST', '/rest/v1/notifications', () => rows(o.inserted ?? [NEW_NOTIFICATION]));
    stub.on('GET', '/rest/v1/user_push_tokens', () => rows([{ expo_push_token: 'ExponentPushToken[abc]' }]));
    stub.on('POST', '/--/api/v2/push/send', () => json({ data: [{ status: 'ok' }] }));
  }

  const dedupeKeys = () => stub.find('POST', '/rest/v1/notifications').map((c) => (c.body as { dedupe_key: string }).dedupe_key);

  it('responds first; the monthly warn notification and its push run via waitUntil', async () => {
    wire();
    const { ctx, flush } = makeCtx();
    const res = await postTx(debitBody(), {}, ctx);
    expect(res.status).toBe(201);
    await flush();

    const notif = stub.last('POST', '/rest/v1/notifications');
    expect(notif.params.get('on_conflict')).toBe('user_id,dedupe_key');
    expect(notif.body).toEqual({
      user_id: USER_ID,
      kind: 'budget_threshold',
      title: '80% of monthly budget used',
      body: "You've spent ₹900 of ₹1,000 this month.",
      action_type: 'home',
      action_transaction_id: null,
      dedupe_key: 'budget:monthly:80:2026-10',
    });
    const push = stub.last('POST', '/--/api/v2/push/send');
    expect((push.body as Record<string, unknown>[])[0]).toMatchObject({ to: 'ExponentPushToken[abc]', title: 'T', body: 'B' });
    // The month summary used the half-open month of the transaction's local day.
    expect(stub.last('POST', '/rpc/transactions_period_summary').body).toMatchObject({
      p_from: '2026-09-30T18:30:00.000Z',
      p_to: '2026-10-31T18:30:00.000Z',
    });
  });

  it('without waitUntil support the work still runs detached and the response is unaffected', async () => {
    wire();
    const res = await postTx(debitBody()); // no ExecutionContext
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(stub.find('POST', '/rest/v1/notifications').length).toBe(1));
  });

  it('emits "over" too once the cap is exceeded, and no push when every insert conflicts (deduped)', async () => {
    wire({ debitTotal: 1200, inserted: [] });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody({ amount: '1200' }), {}, ctx);
    await flush();
    expect(dedupeKeys()).toEqual(['budget:monthly:80:2026-10', 'budget:monthly:100:2026-10']);
    expect(stub.find('POST', '/--/api/v2/push/send')).toHaveLength(0);
    expect(stub.find('GET', '/rest/v1/user_push_tokens')).toHaveLength(0);
  });

  it('checks the category budget first when the transaction has a category', async () => {
    wire({ categoryBudget: 500, debitByCategory: { [CAT]: 450 } });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody({ category_id: CAT }), {}, ctx);
    await flush();
    const posted = stub.find('POST', '/rest/v1/notifications').map((c) => c.body as { dedupe_key: string; title: string; body: string });
    expect(posted[0]).toMatchObject({
      dedupe_key: `budget:category:${CAT}:80:2026-10`,
      title: '80% of Food budget used',
      body: "You've spent ₹450 of ₹500 on Food this month.",
    });
    expect(posted[1]?.dedupe_key).toBe('budget:monthly:80:2026-10');
    // The month RPC is shared by the category and monthly checks.
    expect(stub.find('POST', '/rpc/transactions_period_summary')).toHaveLength(1);
  });

  it('respects alert settings: scope disabled, device notifications off', async () => {
    wire({ settings: () => rows([{ budget_monthly_alerts_enabled: false }]) });
    const first = makeCtx();
    await postTx(debitBody(), {}, first.ctx);
    await first.flush();
    expect(stub.find('POST', '/rest/v1/notifications')).toHaveLength(0);

    resetRoutes();
    stub.calls.length = 0;
    wire({ settings: () => rows([{ device_notifications_enabled: false }]) });
    const second = makeCtx();
    await postTx(debitBody(), {}, second.ctx);
    await second.flush();
    expect(dedupeKeys()).toEqual(['budget:monthly:80:2026-10']); // notification row still created
    expect(stub.find('GET', '/rest/v1/user_push_tokens')).toHaveLength(0); // but no push
  });

  it('uses the user warn percentage in the dedupe key', async () => {
    wire({ settings: () => rows([{ budget_monthly_warn_pct: 70 }]), debitTotal: 750 });
    const { ctx, flush } = makeCtx();
    await postTx(debitBody(), {}, ctx);
    await flush();
    expect(dedupeKeys()).toEqual(['budget:monthly:70:2026-10']);
  });

  it('credits do no notification work at all', async () => {
    wire();
    const { ctx, flush } = makeCtx();
    await postTx(createBody(), {}, ctx);
    await flush();
    expect(stub.find('GET', '/rest/v1/user_settings')).toHaveLength(0);
  });

  it('a duplicate (hash hit) does no notification work', async () => {
    wire();
    resetRoutes();
    stub.on('GET', '/rest/v1/transactions', () => rows([detail({ type: 'debit', note: 'x', category_id: CAT, counterparty_type: 'merchant' })]));
    const { ctx, flush } = makeCtx();
    await postTx(debitBody(), {}, ctx);
    await flush();
    expect(stub.find('GET', '/rest/v1/user_settings')).toHaveLength(0);
  });

  it('a failing background evaluation never fails the response', async () => {
    wire({ settings: () => pgError('08006', 'db down', 500) });
    const { ctx, flush } = makeCtx();
    const res = await postTx(debitBody(), {}, ctx);
    expect(res.status).toBe(201);
    await expect(flush()).resolves.toBeDefined();
  });
});

describe('POST /transactions: Idempotency-Key (C2)', () => {
  const jobRow = (over: Record<string, unknown> = {}) => ({
    id: 'job-1',
    user_id: USER_ID,
    kind: 'manual_create',
    payload: {},
    status: 'processing',
    attempts: 1,
    last_error: null,
    idempotency_key: KEY,
    result: null,
    created_at: '2026-10-04T10:00:00+00:00',
    updated_at: '2026-10-04T10:00:00+00:00',
    ...over,
  });
  const withKey = { headers: { 'Idempotency-Key': KEY } };

  function wireCreate() {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/transactions', () => json([{ id: TX }], { status: 201 }));
  }

  it('claims the key with a manual_create job, creates once and stores the response', async () => {
    wireCreate();
    stub.on('POST', '/rest/v1/jobs', () => rows([jobRow()]));
    stub.on('PATCH', '/rest/v1/jobs', () => rows([]));
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });
    expect(stub.last('POST', '/rest/v1/jobs').body).toEqual([
      { user_id: USER_ID, kind: 'manual_create', payload: {}, status: 'processing', attempts: 1, idempotency_key: KEY },
    ]);
    const done = stub.last('PATCH', '/rest/v1/jobs');
    expect(done.params.get('id')).toBe('eq.job-1');
    expect(done.body).toMatchObject({ status: 'done', result: { status_code: 201, body: { accepted: true } } });
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(1);
  });

  it('replays the stored response without creating anything', async () => {
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'duplicate key value violates unique constraint', 409));
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ status: 'done', result: { status_code: 201, body: { accepted: true } } })]));
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(0);
    expect(stub.find('GET', '/rest/v1/transactions')).toHaveLength(0);
    const lookup = stub.last('GET', '/rest/v1/jobs').params;
    expect(lookup.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(lookup.get('idempotency_key')).toBe(`in.(${KEY})`);
  });

  it('replays a done row whose result lacks a body as 201 {accepted: true}', async () => {
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'dup', 409));
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ status: 'done', result: null })]));
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ accepted: true });
  });

  it('409 while the first request is still processing', async () => {
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'dup', 409));
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ status: 'processing' })]));
    stub.on('PATCH', '/rest/v1/jobs', () => rows([])); // conditional update matches nothing (not stale)
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ detail: 'A request with this Idempotency-Key is still being processed.' });
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(0);
    const reclaim = stub.last('PATCH', '/rest/v1/jobs').params;
    expect(reclaim.get('status')).toBe('eq.processing');
    expect(reclaim.get('updated_at')).toMatch(/^lt\./);
  });

  it('re-claims a failed row with a conditional update and runs the action again', async () => {
    wireCreate();
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'dup', 409));
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ status: 'failed', last_error: 'boom' })]));
    stub.on('PATCH', '/rest/v1/jobs', () => rows([jobRow({ status: 'processing' })]));
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(201);
    const patches = stub.find('PATCH', '/rest/v1/jobs');
    expect(patches[0]?.params.get('status')).toBe('eq.failed');
    expect(patches[0]?.body).toMatchObject({ status: 'processing' });
    expect(patches.at(-1)?.body).toMatchObject({ status: 'done' });
    expect(stub.find('POST', '/rest/v1/transactions')).toHaveLength(1);
  });

  it('re-claims a processing row only after 600 seconds', async () => {
    wireCreate();
    stub.on('POST', '/rest/v1/jobs', () => pgError('23505', 'dup', 409));
    stub.on('GET', '/rest/v1/jobs', () => rows([jobRow({ status: 'processing' })]));
    stub.on('PATCH', '/rest/v1/jobs', () => rows([jobRow()]));
    const before = Date.now();
    expect((await postTx(createBody(), withKey)).status).toBe(201);
    const cutoff = Date.parse((stub.find('PATCH', '/rest/v1/jobs')[0]?.params.get('updated_at') ?? '').slice(3));
    expect(before - cutoff).toBeGreaterThanOrEqual(599_000);
    expect(before - cutoff).toBeLessThan(605_000);
  });

  it('a failing action marks the job failed with last_error and propagates the error', async () => {
    stub.on('GET', '/rest/v1/transactions', () => rows([]));
    stub.on('POST', '/rest/v1/transactions', () => pgError('08006', 'connection failure', 500));
    stub.on('POST', '/rest/v1/jobs', () => rows([jobRow()]));
    stub.on('PATCH', '/rest/v1/jobs', () => rows([]));
    const res = await postTx(createBody(), withKey);
    expect(res.status).toBe(500);
    const failed = stub.last('PATCH', '/rest/v1/jobs').body as Record<string, unknown>;
    expect(failed['status']).toBe('failed');
    expect(String(failed['last_error'])).toContain('connection failure');
    expect(String(failed['last_error']).length).toBeLessThanOrEqual(500);
  });

  it('a malformed key is a 422 and nothing is touched; a blank key means no idempotency', async () => {
    const bad = await postTx(createBody(), { headers: { 'Idempotency-Key': 'short' } });
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ detail: "Invalid Idempotency-Key (use a UUID or 8-100 chars of letters, digits, '-', '_', '.')." });
    expect(stub.calls).toHaveLength(0);

    wireCreate();
    expect((await postTx(createBody(), { headers: { 'Idempotency-Key': '   ' } })).status).toBe(201);
    expect(stub.find('POST', '/rest/v1/jobs')).toHaveLength(0);
  });
});

describe('PATCH /transactions/{id}', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    amount: 250.5,
    type: 'credit',
    counterparty_name: ' New Payee ',
    counterparty_type: 'person',
    category: 'Income',
    category_id: CAT2,
    note: 'fixed',
    transaction_at: '2026-08-02T12:00:00Z',
    ...over,
  });
  const patchTx = (jsonBody: unknown, id = TX) => call(`/api/v1/transactions/${id}`, { method: 'PATCH', json: jsonBody });

  function wire(options: { existing?: Record<string, unknown> | null; clash?: Record<string, unknown> | null; updated?: Record<string, unknown>[]; updateError?: boolean; noCategories?: boolean } = {}) {
    stub.on('GET', '/rest/v1/transactions', (c) => {
      if (c.params.get('id')) return rows(options.existing === null ? [] : [options.existing ?? detail({ payment_hash: 'keep-me' })]);
      return rows(options.clash ? [options.clash] : []);
    });
    stub.on('GET', '/rest/v1/categories', (c) =>
      options.noCategories
        ? rows([])
        : c.params.get('select') === 'id,name'
          ? rows([{ id: CAT2, name: 'Income' }])
          : rows([{ id: CAT2, name: 'Income', icon_name: 'Wallet', color: '#0f0', is_system: true }]),
    );
    stub.on('PATCH', '/rest/v1/transactions', () =>
      options.updateError
        ? pgError('23505', 'duplicate key', 409)
        : rows(options.updated ?? [detail({ amount: 250.5, type: 'credit', category_id: CAT2, counterparty_name: 'New Payee' })]),
    );
  }

  it('writes the editable fields, recomputes the hash and returns the enriched row', async () => {
    wire();
    const res = await patchTx(body());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: TX, amount: '250.50', type: 'credit', category: 'Income', category_icon_name: 'Wallet', merchant: 'New Payee' });
    const upd = stub.last('PATCH', '/rest/v1/transactions');
    expect(upd.params.get('id')).toBe(`eq.${TX}`);
    expect(upd.params.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(upd.params.get('deleted_at')).toBe('is.null');
    expect(upd.body).toEqual({
      amount: '250.50',
      type: 'credit',
      note: 'fixed',
      transaction_at: '2026-08-02T12:00:00.000Z',
      category_id: CAT2,
      counterparty_name: 'New Payee',
      counterparty_normalized: 'new payee',
      counterparty_type: 'person',
      payment_hash: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
  });

  it('does not rewrite the hash when the fingerprint is unchanged', async () => {
    // First request computes the hash for this body; second sees it already stored.
    wire();
    await patchTx(body());
    const hash = (stub.last('PATCH', '/rest/v1/transactions').body as Record<string, string>)['payment_hash'];
    stub.calls.length = 0;
    resetRoutes();
    wire({ existing: detail({ payment_hash: hash }) });
    expect((await patchTx(body())).status).toBe(200);
    expect(stub.last('PATCH', '/rest/v1/transactions').body).not.toHaveProperty('payment_hash');
  });

  it('409 when the edit matches another active transaction', async () => {
    wire({ clash: detail({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' }) });
    const res = await patchTx(body());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ detail: 'Another transaction already has the same amount, payee, type and time.' });
    expect(stub.find('PATCH', '/rest/v1/transactions')).toHaveLength(0);
  });

  it('a legacy row without a hash that would clash keeps its hash unset (200)', async () => {
    wire({ existing: detail({ payment_hash: null }), clash: detail({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' }) });
    expect((await patchTx(body())).status).toBe(200);
    expect(stub.last('PATCH', '/rest/v1/transactions').body).not.toHaveProperty('payment_hash');
  });

  it('a unique violation raised by the update itself is also a 409', async () => {
    wire({ updateError: true });
    expect((await patchTx(body())).status).toBe(409);
  });

  it('clears the category when none resolves (matches Python) and keeps counterparty_type out when absent', async () => {
    wire({ existing: detail({ payment_hash: null }), noCategories: true });
    await patchTx(body({ category: 'Nope', category_id: undefined, counterparty_type: undefined }));
    const upd = stub.last('PATCH', '/rest/v1/transactions').body as Record<string, unknown>;
    expect(upd['category_id']).toBeNull();
    expect(upd).not.toHaveProperty('counterparty_type');
  });

  it('404 when the transaction is missing or the update matches no row', async () => {
    wire({ existing: null });
    const res = await patchTx(body());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Transaction not found.' });
    stub.calls.length = 0;
    resetRoutes();
    wire({ updated: [] });
    expect((await patchTx(body())).status).toBe(404);
  });

  it('422 for a malformed id or body', async () => {
    expect((await patchTx(body(), 'nope')).status).toBe(422);
    expect((await patchTx({ ...body(), amount: '-1' })).status).toBe(422);
    expect(stub.calls).toHaveLength(0);
  });
});

describe('DELETE /transactions/{id}', () => {
  it('soft deletes an active owned row (204, empty body)', async () => {
    stub.on('PATCH', '/rest/v1/transactions', () => rows([{ id: TX }]));
    const res = await call(`/api/v1/transactions/${TX}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    const upd = stub.last('PATCH', '/rest/v1/transactions');
    expect(upd.params.get('id')).toBe(`eq.${TX}`);
    expect(upd.params.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(upd.params.get('deleted_at')).toBe('is.null');
    expect(Date.parse((upd.body as { deleted_at: string }).deleted_at)).toBeGreaterThan(Date.now() - 5000);
  });

  it('404 when nothing was updated; 422 for a bad id', async () => {
    stub.on('PATCH', '/rest/v1/transactions', () => rows([]));
    const res = await call(`/api/v1/transactions/${TX}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Transaction not found.' });
    expect((await call('/api/v1/transactions/x', { method: 'DELETE' })).status).toBe(422);
  });

  it('another user cannot delete: the query is always scoped to the JWT user', async () => {
    const other = await signToken({ sub: '99999999-9999-9999-9999-999999999999' });
    stub.on('PATCH', '/rest/v1/transactions', () => rows([]));
    const res = await call(`/api/v1/transactions/${TX}`, { method: 'DELETE', token: other });
    expect(res.status).toBe(404);
    expect(stub.last('PATCH', '/rest/v1/transactions').params.get('user_id')).toBe('eq.99999999-9999-9999-9999-999999999999');
  });
});
