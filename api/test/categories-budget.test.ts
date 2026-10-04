import { describe, expect, it } from 'vitest';

import { decimalInput, formatMoney } from '../src/core/decimal';
import { USER_ID, call } from './helpers';
import { json, pgError, rows, useSupabaseStub } from './supabase-stub';

const stub = useSupabaseStub();
const CAT = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
const custom = (over: Record<string, unknown> = {}) => ({
  id: CAT, user_id: USER_ID, name: 'Snacks', icon_name: 'Tag', color: '#94A3B8', is_system: false, created_at: '2026-01-01T00:00:00+00:00', ...over,
});
const system = (over: Record<string, unknown> = {}) => ({
  id: OTHER, user_id: null, name: 'Food', icon_name: 'Utensils', color: '#111111', is_system: true, created_at: '2026-01-01T00:00:00+00:00', ...over,
});
const patch = (id: string, jsonBody: unknown) => call(`/api/v1/categories/${id}`, { method: 'PATCH', json: jsonBody });

describe('GET /categories', () => {
  it('lists system + own categories ordered by name, with null user_id/budget_amount for system rows', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([system(), custom(), { id: 'bad', name: null }]));
    const res = await call('/api/v1/categories');
    const body = await res.json<Record<string, unknown>[]>();
    expect(body).toHaveLength(2); // the malformed row is skipped
    expect(body[0]).toEqual({ ...system(), user_id: null, budget_amount: null });
    expect(body[1]).toMatchObject({ user_id: USER_ID, budget_amount: null });
    const q = stub.last('GET', '/rest/v1/categories').params;
    expect(q.get('or')).toBe(`(is_system.eq.true,user_id.eq.${USER_ID})`);
    expect(q.get('order')).toBe('name.asc');
  });
});

describe('POST /categories', () => {
  it('creates with defaults, 201, one list + one insert', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([system()]));
    stub.on('POST', '/rest/v1/categories', (c) => json({ ...(c.body as object), id: CAT, created_at: '2026-02-01T00:00:00+00:00' }));
    const res = await call('/api/v1/categories', { method: 'POST', json: { name: '  Coffee ' } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: 'Coffee', icon_name: 'Tag', color: '#94A3B8', is_system: false, user_id: USER_ID, budget_amount: null });
    expect(stub.calls).toHaveLength(2);
  });

  it('409 on a case-insensitive duplicate, 400 at 15 custom categories, 422 on a bad color', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([system()]));
    expect((await call('/api/v1/categories', { method: 'POST', json: { name: 'FOOD' } })).status).toBe(409);
    const color = await call('/api/v1/categories', { method: 'POST', json: { name: 'X', color: 'red' } });
    expect(color.status).toBe(422);
    expect(await color.json()).toEqual({ detail: 'Color must be a hex value like #94A3B8.' });
  });

  it('enforces the 15 custom category cap', async () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => custom({ id: `c${i}`, name: `n${i}` }));
    stub.on('GET', '/rest/v1/categories', () => rows(fifteen));
    const res = await call('/api/v1/categories', { method: 'POST', json: { name: 'One more' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: 'You can add up to 15 custom categories.' });
  });

  it('validates name length', async () => {
    const res = await call('/api/v1/categories', { method: 'POST', json: { name: '' } });
    expect(res.status).toBe(422);
  });
});

describe('PATCH /categories/{id} (C1)', () => {
  it('empty body is 422 "Nothing to update."', async () => {
    const res = await patch(CAT, {});
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: [{ type: 'value_error', loc: ['body'], msg: 'Value error, Nothing to update.' }] });
  });

  it.each([['-1'], ['NaN'], ['Infinity'], ['abc'], ['1.234'], ['12345678901']])('rejects budget_amount %s', async (v) => {
    expect((await patch(CAT, { budget_amount: v })).status).toBe(422);
  });

  it('absent budget_amount: plain update, keeps existing icon/color, never calls the RPC', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('PATCH', '/rest/v1/categories', () => rows([custom({ name: 'Treats' })]));
    const res = await patch(CAT, { name: 'Treats' });
    expect(await res.json()).toMatchObject({ name: 'Treats', budget_amount: null });
    expect(stub.last('PATCH', '/rest/v1/categories').body).toEqual({ name: 'Treats', icon_name: 'Tag', color: '#94A3B8' });
    expect(stub.find('POST', '/rest/v1/rpc/')).toHaveLength(0);
  });

  it('budget value: one RPC call with p_set_budget true; response budget_amount is a 2-decimal string', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => json({ category: custom({ name: 'Treats' }), monthly_amount: 500 }));
    const res = await patch(CAT, { name: 'Treats', budget_amount: '500' });
    expect(await res.json()).toMatchObject({ name: 'Treats', budget_amount: '500.00' });
    expect(stub.last('POST', '/rest/v1/rpc/update_category_with_budget').body).toEqual({
      p_user_id: USER_ID, p_category_id: CAT, p_name: 'Treats', p_icon_name: null, p_color: null, p_set_budget: true, p_budget_amount: '500',
    });
    expect(stub.find('PATCH', '/rest/v1/categories')).toHaveLength(0);
  });

  it('numeric budget_amount is accepted too (C6)', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => json({ category: custom(), monthly_amount: 500.5 }));
    const res = await patch(CAT, { budget_amount: 500.5 });
    expect((await res.json<{ budget_amount: string }>()).budget_amount).toBe('500.50');
    expect((stub.last('POST', '/rest/v1/rpc/').body as { p_budget_amount: string }).p_budget_amount).toBe('500.5');
  });

  it('budget_amount null removes the budget (p_budget_amount null) and returns budget_amount null', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => json({ category: custom(), monthly_amount: null }));
    const res = await patch(CAT, { budget_amount: null });
    expect(res.status).toBe(200);
    expect((await res.json<{ budget_amount: unknown }>()).budget_amount).toBeNull();
    expect(stub.last('POST', '/rest/v1/rpc/').body).toMatchObject({ p_set_budget: true, p_budget_amount: null, p_name: null });
  });

  it('budget-only change is allowed on a system category; renaming one is 403', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([system()]));
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => json({ category: system(), monthly_amount: 100 }));
    const ok = await patch(OTHER, { budget_amount: '100' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ is_system: true, user_id: null, budget_amount: '100.00' });
    const forbidden = await patch(OTHER, { name: 'New', budget_amount: '1' });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ detail: 'System categories cannot be edited.' });
  });

  it('maps RPC P0002 -> 404 and 23505 -> 409; unknown id -> 404', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => pgError('P0002', 'category not found'), { once: true });
    expect((await patch(CAT, { budget_amount: '5' })).status).toBe(404);
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => pgError('23505', 'duplicate key', 409), { once: true });
    expect((await patch(CAT, { budget_amount: '5' })).status).toBe(409);
    const missing = await patch(OTHER, { name: 'x' });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ detail: 'Category not found.' });
  });

  it('409 when renaming to an existing name', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom(), custom({ id: 'other', name: 'Coffee' })]));
    const res = await patch(CAT, { name: 'coffee' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /categories/{id} and delete-impact', () => {
  it('delete-impact returns the active transaction count (HEAD count query)', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('HEAD', '/rest/v1/transactions', () => new Response(null, { headers: { 'content-range': '*/3' } }));
    const res = await call(`/api/v1/categories/${CAT}/delete-impact`);
    expect(await res.json()).toEqual({ transaction_count: 3 });
    const q = stub.last('HEAD', '/rest/v1/transactions').params;
    expect(q.get('deleted_at')).toBe('is.null');
    expect(q.get('category_id')).toBe(`eq.${CAT}`);
  });

  it('system categories: 403 for impact and delete', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([system()]));
    stub.on('HEAD', '/rest/v1/transactions', () => new Response(null, { headers: { 'content-range': '*/0' } }));
    expect((await call(`/api/v1/categories/${OTHER}/delete-impact`)).status).toBe(403);
    const del = await call(`/api/v1/categories/${OTHER}`, { method: 'DELETE' });
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ detail: 'System categories cannot be deleted.' });
  });

  it('without transactions: deletes and returns 204', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom()]));
    stub.on('HEAD', '/rest/v1/transactions', () => new Response(null, { headers: { 'content-range': '*/0' } }));
    stub.on('DELETE', '/rest/v1/categories', () => rows([{ id: CAT }]));
    const res = await call(`/api/v1/categories/${CAT}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    const q = stub.last('DELETE', '/rest/v1/categories').params;
    expect(q.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(q.get('is_system')).toBe('eq.false');
  });

  it('with transactions requires a different target (422), else reassigns only category_id then deletes', async () => {
    stub.on('GET', '/rest/v1/categories', () => rows([custom(), system()]));
    stub.on('HEAD', '/rest/v1/transactions', () => new Response(null, { headers: { 'content-range': '*/2' } }));
    stub.on('PATCH', '/rest/v1/transactions', () => new Response(null, { status: 204 }));
    stub.on('DELETE', '/rest/v1/categories', () => rows([{ id: CAT }]));

    const none = await call(`/api/v1/categories/${CAT}`, { method: 'DELETE' });
    expect(none.status).toBe(422);
    expect(await none.json()).toEqual({ detail: 'Choose a category to move transactions to before deleting.' });
    const same = await call(`/api/v1/categories/${CAT}?reassign_to_category_id=${CAT}`, { method: 'DELETE' });
    expect(same.status).toBe(422);
    const unknown = await call(`/api/v1/categories/${CAT}?reassign_to_category_id=nope`, { method: 'DELETE' });
    expect(await unknown.json()).toEqual({ detail: 'Target category not found.' });
    expect(stub.find('PATCH', '/rest/v1/transactions')).toHaveLength(0);

    const ok = await call(`/api/v1/categories/${CAT}?reassign_to_category_id=${OTHER}`, { method: 'DELETE' });
    expect(ok.status).toBe(204);
    expect(stub.last('PATCH', '/rest/v1/transactions').body).toEqual({ category_id: OTHER });
  });
});

describe('/budget', () => {
  const row = { id: 'b1', user_id: USER_ID, monthly_budget: 25000, daily_budget: 500.5, created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-02T00:00:00' };

  it('GET returns null budget when none exists, else decimal strings and Z timestamps', async () => {
    stub.on('GET', '/rest/v1/budgets', () => rows([]), { once: true });
    expect(await (await call('/api/v1/budget')).json()).toEqual({ budget: null });
    stub.on('GET', '/rest/v1/budgets', () => rows([row]));
    expect(await (await call('/api/v1/budget')).json()).toEqual({
      budget: { id: 'b1', user_id: USER_ID, monthly_budget: '25000.00', daily_budget: '500.50', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00' },
    });
  });

  it('PATCH monthly only updates just that column in one request', async () => {
    stub.on('PATCH', '/rest/v1/budgets', () => rows([{ ...row, monthly_budget: 30000 }]));
    const res = await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '30000.00' } });
    expect(await res.json()).toMatchObject({ monthly_budget: '30000.00', daily_budget: '500.50' });
    expect(stub.last('PATCH', '/rest/v1/budgets').body).toEqual({ monthly_budget: '30000' });
    expect(stub.calls).toHaveLength(1);
  });

  it('PATCH on first save inserts the other cap as 0', async () => {
    stub.on('PATCH', '/rest/v1/budgets', () => rows([]));
    stub.on('POST', '/rest/v1/budgets', () => json({ ...row, monthly_budget: 0, daily_budget: 500 }));
    const res = await call('/api/v1/budget', { method: 'PATCH', json: { daily_amount: 500 } });
    expect(res.status).toBe(200);
    expect(stub.last('POST', '/rest/v1/budgets').body).toEqual({ user_id: USER_ID, monthly_budget: '0', daily_budget: '500' });
    expect(stub.last('POST', '/rest/v1/budgets').params.get('on_conflict')).toBe('user_id');
  });

  it('PATCH requires at least one amount, and amounts must be >= 0', async () => {
    const none = await call('/api/v1/budget', { method: 'PATCH', json: {} });
    expect(none.status).toBe(422);
    expect(await none.json()).toMatchObject({ detail: [{ type: 'value_error', msg: 'Value error, At least one of monthly_amount or daily_amount is required.' }] });
    expect((await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '-5' } })).status).toBe(422);
  });

  it('GET /budget/categories lists items', async () => {
    stub.on('GET', '/rest/v1/category_budgets', () => rows([{ category_id: CAT, monthly_amount: 5000 }, { category_id: OTHER, monthly_amount: null }]));
    expect(await (await call('/api/v1/budget/categories')).json()).toEqual({ items: [{ category_id: CAT, monthly_amount: '5000.00' }] });
  });

  it('PUT /budget/categories/{id} sets via the RPC (visibility + write atomically); amount must be > 0', async () => {
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => json({ category: custom(), monthly_amount: 2500 }));
    const res = await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '2500.00' } });
    expect(await res.json()).toEqual({ category_id: CAT, monthly_amount: '2500.00' });
    expect(stub.last('POST', '/rest/v1/rpc/').body).toMatchObject({ p_set_budget: true, p_budget_amount: '2500', p_name: null });
    expect((await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '0' } })).status).toBe(422);
  });

  it('PUT/DELETE on an invisible or malformed category id is 404', async () => {
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => pgError('P0002', 'category not found'), { once: true });
    const put = await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '5' } });
    expect(put.status).toBe(404);
    expect(await put.json()).toEqual({ detail: 'Category not found.' });
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => pgError('22P02', 'invalid input syntax for type uuid'), { once: true });
    expect((await call('/api/v1/budget/categories/nope', { method: 'DELETE' })).status).toBe(404);
  });

  it('DELETE /budget/categories/{id} removes via the RPC and returns 204', async () => {
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => json({ category: custom(), monthly_amount: null }));
    const res = await call(`/api/v1/budget/categories/${CAT}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(stub.last('POST', '/rest/v1/rpc/').body).toMatchObject({ p_set_budget: true, p_budget_amount: null });
  });

  it('other failures become 502 with the Python messages', async () => {
    stub.on('POST', '/rest/v1/rpc/update_category_with_budget', () => pgError('XX000', 'boom', 500));
    const res = await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '5' } });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: 'Could not save category budget.' });
  });
});

describe('decimal helpers', () => {
  it('canonicalizes strings and numbers', () => {
    const p = decimalInput({ maxWholeDigits: 10, maxDecimalPlaces: 2 });
    expect(p.parse('500.00')).toBe('500');
    expect(p.parse(' 0012.50 ')).toBe('12.5');
    expect(p.parse(0)).toBe('0');
    expect(p.parse('.5')).toBe('0.5');
    expect(() => p.parse('1e3')).toThrow();
    expect(() => p.parse('')).toThrow();
    expect(() => decimalInput({ positive: true }).parse('0')).toThrow();
  });
  it('formatMoney uses two decimals', () => {
    expect(formatMoney(5000)).toBe('5000.00');
    expect(formatMoney('12.5')).toBe('12.50');
    expect(formatMoney(null)).toBe('0.00');
  });
});
