import { describe, expect, it } from 'vitest';

import { decimalInput, decimalToCents, formatMoney } from '../src/core/decimal';
import { INSUFFICIENT_PRIVILEGE, NO_DATA_FOUND } from '../src/core/db-errors';
import type { Bindings } from '../src/core/env';
import { updateCategoryWithBudget } from '../src/features/categories/repository';
import { USER_ID, call, makeEnv } from './helpers';
import { failingDb, oneRow, rowsOf, seedCategory, seedCategoryBudget, seedTransaction, seedUser, testDb } from './db';

const CAT = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
const STRANGER = '44444444-4444-4444-4444-444444444444';
/** A seeded system category. */
const FOOD = '85bf877a-f8b1-4b07-a9fb-5e8c809907ae';
const patch = (id: string, jsonBody: unknown) => call(`/api/v1/categories/${id}`, { method: 'PATCH', json: jsonBody });
const noLimit = () => makeEnv({ WRITE_LIMITER: undefined });
const budgetOf = (categoryId: string) => oneRow<{ monthly_amount: number }>('category_budgets', 'user_id = ? AND category_id = ?', USER_ID, categoryId);

const seedCustom = (over: Partial<Parameters<typeof seedCategory>[0]> = {}) =>
  seedCategory({ id: CAT, name: 'Snacks', created_at: '2026-01-01T00:00:00.000Z', ...over });

describe('GET /categories', () => {
  it('lists system + own categories ordered by name, with null user_id/budget_amount for system rows', async () => {
    await seedCustom();
    await seedUser(OTHER);
    await seedCategory({ id: STRANGER, user_id: OTHER, name: 'Strangers only' });
    // A row without an icon is skipped from the response.
    await testDb().prepare("INSERT INTO categories (id, name, user_id, color, is_system, created_at) VALUES ('bad', 'Broken', ?, '#000000', 0, 'x')").bind(USER_ID).run();
    const res = await call('/api/v1/categories');
    const body = await res.json<Record<string, unknown>[]>();
    expect(body.map((c) => c['name'])).toEqual([
      'Bills & Utilities', 'Education', 'Entertainment', 'Food & Dining', 'Health', 'Income', 'Other', 'Shopping', 'Snacks', 'Transport', 'Travel',
    ]);
    expect(body.every((c) => c['scope'] === 'spend')).toBe(true);
    expect(body[0]).toEqual({
      id: 'ad296c59-42ec-49e5-b824-c011c5b1b28b', name: 'Bills & Utilities', icon_name: 'Zap', color: '#FBBF24', is_system: true,
      created_at: '2026-06-11T17:30:06.824Z', user_id: null, budget_amount: null, scope: 'spend',
    });
    expect(body.find((c) => c['name'] === 'Snacks')).toMatchObject({ user_id: USER_ID, is_system: false, budget_amount: null });
  });
});

describe('category scopes', () => {
  const SALARY = 'f48bfe4a-8f08-4229-b977-e1292b11490f';
  const RENT = '94b82777-eee4-46de-8c18-7490bda02b60';

  it('GET lists recurring categories only with ?scope=', async () => {
    const expense = await (await call('/api/v1/categories?scope=recurring_expense')).json<Record<string, unknown>[]>();
    expect(expense.map((c) => c['name'])).toContain('Rent');
    expect(expense.every((c) => c['scope'] === 'recurring_expense')).toBe(true);
    const income = await (await call('/api/v1/categories?scope=recurring_income')).json<Record<string, unknown>[]>();
    expect(income.map((c) => c['name'])).toContain('Salary');
    expect((await call('/api/v1/categories?scope=nope')).status).toBe(422);
  });

  it('a custom category cannot reuse a recurring category name (uniqueness spans all scopes)', async () => {
    expect((await call('/api/v1/categories', { method: 'POST', json: { name: 'rent' } })).status).toBe(409);
  });

  it('category budgets are rejected on recurring categories (PUT and PATCH), but spend ones still work', async () => {
    expect((await call(`/api/v1/budget/categories/${RENT}`, { method: 'PUT', json: { monthly_amount: '10' } })).status).toBe(422);
    expect((await patch(SALARY, { budget_amount: '10' })).status).toBe(422);
    expect((await call(`/api/v1/budget/categories/${FOOD}`, { method: 'PUT', json: { monthly_amount: '10' } })).status).toBe(200);
  });

  it('a manual transaction cannot use a recurring category (422), only everyday ones', async () => {
    const post = (json: Record<string, unknown>) => call('/api/v1/transactions?timezone=Asia/Kolkata', { method: 'POST', json, env: noLimit() });
    const body = { amount: '10', type: 'debit', counterparty_name: 'Landlord', transaction_at: '2026-07-01T10:00:00.000Z' };
    const rent = await post({ ...body, category_id: RENT });
    expect(rent.status).toBe(422);
    expect(await rent.json()).toEqual({ detail: 'Recurring categories can only be used by recurring items. Choose an everyday category.' });
    expect((await post({ ...body, type: 'credit', counterparty_name: 'Employer', category_id: SALARY })).status).toBe(422);
    expect((await post({ ...body, counterparty_name: 'Wrong', category_id: SALARY })).status).toBe(422);
    expect(await rowsOf('transactions')).toHaveLength(0);
    // An everyday category still works.
    const food = await post({ ...body, counterparty_name: 'Cafe', category_id: FOOD });
    expect(food.status, JSON.stringify(await food.clone().json())).toBe(201);
    expect(await oneRow('transactions', 'counterparty_name = ?', 'Cafe')).toMatchObject({ category_id: FOOD, recurring_item_id: null });
    // A name never matches a recurring category: the transaction is saved uncategorized.
    const byName = await post({ ...body, counterparty_name: 'Nameonly', category: 'Rent' });
    expect(byName.status, JSON.stringify(await byName.clone().json())).toBe(201);
    expect(await oneRow('transactions', 'counterparty_name = ?', 'Nameonly')).toMatchObject({ category_id: null });
  });

  it('editing: a recurring category is accepted only on a recurring-posted row, in its own direction, and kept when echoed back', async () => {
    const itemId = '77777777-7777-4777-8777-777777777777';
    await testDb()
      .prepare(
        `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, timezone, next_due_date, active)
         VALUES (?, ?, 'subscription', 'Rent', 1000, ?, 'monthly', 1, 'Asia/Kolkata', '2026-11-01', 1)`,
      )
      .bind(itemId, USER_ID, RENT)
      .run();
    const posted = await seedTransaction({ category_id: RENT, counterparty_name: 'Landlord', amount: '10', type: 'debit', recurring_item_id: itemId });
    const plain = await seedTransaction({ category_id: FOOD, counterparty_name: 'Cafe', amount: '5', type: 'debit' });
    const put = (id: string, category_id: string, type = 'debit') =>
      call(`/api/v1/transactions/${id}?timezone=Asia/Kolkata`, {
        method: 'PATCH',
        env: noLimit(),
        json: { amount: '12', type, counterparty_name: 'Landlord', category_id, transaction_at: '2026-10-04T10:00:00.000Z' },
      });
    // Echoed back unchanged on a recurring-posted row: kept.
    const kept = await put(posted, RENT);
    expect(kept.status, JSON.stringify(await kept.clone().json())).toBe(200);
    expect(await oneRow('transactions', 'id = ?', posted)).toMatchObject({ category_id: RENT, recurring_item_id: itemId });
    // A recurring-posted row may switch to another recurring category of its direction, not the other direction;
    // echoing its own category back after flipping the type is rejected too.
    expect((await put(posted, RENT, 'credit')).status).toBe(422);
    expect((await put(posted, SALARY)).status).toBe(422);
    expect((await put(posted, SALARY, 'credit')).status).toBe(200);
    // A manual row cannot take a recurring category at all, whatever the direction.
    const refused = await put(plain, RENT);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ detail: 'Recurring categories can only be used by recurring items. Choose an everyday category.' });
    expect((await put(plain, SALARY, 'credit')).status).toBe(422);
    expect(await oneRow('transactions', 'id = ?', plain)).toMatchObject({ category_id: FOOD });
    // Everyday categories are unaffected.
    expect((await put(plain, FOOD)).status).toBe(200);
  });

  it('editing: a legacy row with a manually set recurring category keeps it only while the type still fits', async () => {
    const legacy = await seedTransaction({ category_id: RENT, counterparty_name: 'Landlord', amount: '10', type: 'debit' });
    const put = (type: string) =>
      call(`/api/v1/transactions/${legacy}?timezone=Asia/Kolkata`, {
        method: 'PATCH',
        env: noLimit(),
        json: { amount: '12', type, counterparty_name: 'Landlord', category_id: RENT, transaction_at: '2026-10-04T10:00:00.000Z' },
      });
    expect((await put('debit')).status).toBe(200);
    // Flipping the type with the echoed category is rejected, and the row is untouched.
    expect((await put('credit')).status).toBe(422);
    expect(await oneRow('transactions', 'id = ?', legacy)).toMatchObject({ type: 'debit', category_id: RENT });
  });
});

describe('POST /categories', () => {
  it('creates with defaults and 201', async () => {
    const res = await call('/api/v1/categories', { method: 'POST', json: { name: '  Coffee ' } });
    expect(res.status).toBe(201);
    const body = await res.json<{ id: string }>();
    expect(body).toMatchObject({ name: 'Coffee', icon_name: 'Tag', color: '#94A3B8', is_system: false, user_id: USER_ID, budget_amount: null });
    expect(await oneRow('categories', 'id = ?', body.id)).toMatchObject({ name: 'Coffee', user_id: USER_ID, is_system: 0 });
  });

  it('409 on a case-insensitive duplicate, 422 on a bad color', async () => {
    expect((await call('/api/v1/categories', { method: 'POST', json: { name: 'FOOD & dining' } })).status).toBe(409);
    const color = await call('/api/v1/categories', { method: 'POST', json: { name: 'X', color: 'red' } });
    expect(color.status).toBe(422);
    expect(await color.json()).toEqual({ detail: 'Color must be a hex value like #94A3B8.' });
  });

  it("allows a name another user's custom category already has (names are unique per user)", async () => {
    await seedUser(OTHER);
    await seedCategory({ id: STRANGER, user_id: OTHER, name: 'Coffee' });
    const res = await call('/api/v1/categories', { method: 'POST', json: { name: 'coffee' } });
    expect(res.status).toBe(201);
  });

  it('enforces the 15 custom category cap', async () => {
    for (let i = 0; i < 15; i++) await seedCategory({ name: `n${i}` });
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

  it('absent budget_amount: plain update, keeps existing icon/color, leaves budgets alone', async () => {
    await seedCustom();
    await seedCategoryBudget(CAT, '75');
    const res = await patch(CAT, { name: 'Treats' });
    expect(await res.json()).toMatchObject({ name: 'Treats', budget_amount: null });
    expect(await oneRow('categories', 'id = ?', CAT)).toMatchObject({ name: 'Treats', icon_name: 'Tag', color: '#94A3B8' });
    expect((await budgetOf(CAT))?.monthly_amount).toBe(7500);
  });

  it('budget value: category and budget change together; response budget_amount is a 2-decimal string', async () => {
    await seedCustom();
    const res = await patch(CAT, { name: 'Treats', budget_amount: '500' });
    expect(await res.json()).toMatchObject({ name: 'Treats', budget_amount: '500.00' });
    expect(await oneRow('categories', 'id = ?', CAT)).toMatchObject({ name: 'Treats' });
    expect((await budgetOf(CAT))?.monthly_amount).toBe(50000);
    // A second save updates the same row.
    await patch(CAT, { budget_amount: '12.5' });
    expect(await rowsOf('category_budgets')).toHaveLength(1);
    expect((await budgetOf(CAT))?.monthly_amount).toBe(1250);
  });

  it('numeric budget_amount is accepted too (C6)', async () => {
    await seedCustom();
    const res = await patch(CAT, { budget_amount: 500.5 });
    expect((await res.json<{ budget_amount: string }>()).budget_amount).toBe('500.50');
    expect((await budgetOf(CAT))?.monthly_amount).toBe(50050);
  });

  it('budget_amount null removes the budget and returns budget_amount null', async () => {
    await seedCustom();
    await seedCategoryBudget(CAT, '75');
    const res = await patch(CAT, { budget_amount: null });
    expect(res.status).toBe(200);
    expect((await res.json<{ budget_amount: unknown }>()).budget_amount).toBeNull();
    expect(await budgetOf(CAT)).toBeNull();
  });

  it('budget-only change is allowed on a system category; renaming one is 403 and writes nothing', async () => {
    const ok = await patch(FOOD, { budget_amount: '100' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ is_system: true, user_id: null, budget_amount: '100.00' });
    const forbidden = await patch(FOOD, { name: 'New', budget_amount: '1' });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ detail: 'System categories cannot be edited.' });
    expect((await budgetOf(FOOD))?.monthly_amount).toBe(10000);
    expect(await oneRow('categories', 'id = ?', FOOD)).toMatchObject({ name: 'Food & Dining' });
  });

  it("unknown id and another user's category are 404", async () => {
    await seedUser(OTHER);
    await seedCategory({ id: STRANGER, user_id: OTHER, name: 'Theirs' });
    for (const id of [CAT, STRANGER]) {
      const missing = await patch(id, { name: 'x' });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ detail: 'Category not found.' });
    }
    expect((await patch(STRANGER, { budget_amount: '5' })).status).toBe(404);
    expect(await rowsOf('category_budgets')).toHaveLength(0);
  });

  it('409 when renaming to a name you can already see; free when only another user has it', async () => {
    await seedCustom();
    await seedCategory({ name: 'Coffee' });
    expect((await patch(CAT, { name: 'coffee' })).status).toBe(409);
    // A name only another user has is free (names are unique per user), on the plain and the budget path.
    await seedUser(OTHER);
    await seedCategory({ user_id: OTHER, name: 'Hidden' });
    expect((await patch(CAT, { name: 'HIDDEN' })).status).toBe(200);
    expect((await patch(CAT, { name: 'hidden', budget_amount: '5' })).status).toBe(200);
    expect(await oneRow('categories', 'id = ?', CAT)).toMatchObject({ name: 'hidden' });
  });
});

describe('updateCategoryWithBudget (atomic C1 write)', () => {
  const base = { userId: USER_ID, categoryId: CAT, name: null, iconName: null, color: null, setBudget: false, budgetAmount: null };

  it('not visible -> NO_DATA_FOUND (404); system category edit -> INSUFFICIENT_PRIVILEGE (403)', async () => {
    await expect(updateCategoryWithBudget(testDb(), base)).rejects.toMatchObject({ code: NO_DATA_FOUND });
    await seedUser(OTHER);
    await seedCategory({ id: STRANGER, user_id: OTHER, name: 'Theirs' });
    await expect(updateCategoryWithBudget(testDb(), { ...base, categoryId: STRANGER, setBudget: true, budgetAmount: '5' })).rejects.toMatchObject({
      code: NO_DATA_FOUND,
    });
    await expect(updateCategoryWithBudget(testDb(), { ...base, categoryId: FOOD, name: 'Nope' })).rejects.toMatchObject({
      code: INSUFFICIENT_PRIVILEGE,
    });
    expect(await rowsOf('category_budgets')).toHaveLength(0);
  });

  it('applies the category update and the budget upsert together and returns both', async () => {
    await seedCustom();
    const result = await updateCategoryWithBudget(testDb(), { ...base, name: 'Treats', color: '#112233', setBudget: true, budgetAmount: '40.25' });
    expect(result.category).toMatchObject({ id: CAT, name: 'Treats', color: '#112233', icon_name: 'Tag', is_system: false });
    expect(result.monthly_amount).toBe('40.25');
    expect((await budgetOf(CAT))?.monthly_amount).toBe(4025);
  });

  it('is all-or-nothing: a failing budget write rolls the category change back', async () => {
    await seedCustom();
    // monthly_amount must be > 0 (CHECK), so the second statement of the batch fails.
    await expect(updateCategoryWithBudget(testDb(), { ...base, name: 'Treats', setBudget: true, budgetAmount: '0' })).rejects.toThrow();
    expect(await oneRow('categories', 'id = ?', CAT)).toMatchObject({ name: 'Snacks' });
    expect(await rowsOf('category_budgets')).toHaveLength(0);
  });
});

describe('DELETE /categories/{id} and delete-impact', () => {
  it('delete-impact returns the active transaction count (soft-deleted and foreign rows excluded)', async () => {
    await seedCustom();
    await seedTransaction({ category_id: CAT });
    await seedTransaction({ category_id: CAT });
    await seedTransaction({ category_id: CAT });
    await seedTransaction({ category_id: CAT, deleted_at: '2026-10-05T00:00:00.000Z' });
    await seedTransaction({ category_id: FOOD });
    const res = await call(`/api/v1/categories/${CAT}/delete-impact`);
    expect(await res.json()).toEqual({ transaction_count: 3 });
  });

  it('system categories: 403 for impact and delete; unknown id 404', async () => {
    expect((await call(`/api/v1/categories/${FOOD}/delete-impact`)).status).toBe(403);
    const del = await call(`/api/v1/categories/${FOOD}`, { method: 'DELETE' });
    expect(del.status).toBe(403);
    expect(await del.json()).toEqual({ detail: 'System categories cannot be deleted.' });
    expect((await call(`/api/v1/categories/${CAT}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('without transactions: deletes (and its budget) and returns 204', async () => {
    await seedCustom();
    await seedCategoryBudget(CAT, '10');
    const res = await call(`/api/v1/categories/${CAT}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await oneRow('categories', 'id = ?', CAT)).toBeNull();
    expect(await rowsOf('category_budgets')).toHaveLength(0);
  });

  it('with transactions requires a different target (422), else reassigns only category_id then deletes', async () => {
    await seedCustom();
    const t1 = await seedTransaction({ category_id: CAT, note: 'keep me' });
    const t2 = await seedTransaction({ category_id: CAT });

    const none = await call(`/api/v1/categories/${CAT}`, { method: 'DELETE' });
    expect(none.status).toBe(422);
    expect(await none.json()).toEqual({ detail: 'Choose a category to move transactions to before deleting.' });
    const same = await call(`/api/v1/categories/${CAT}?reassign_to_category_id=${CAT}`, { method: 'DELETE' });
    expect(same.status).toBe(422);
    const unknown = await call(`/api/v1/categories/${CAT}?reassign_to_category_id=nope`, { method: 'DELETE' });
    expect(await unknown.json()).toEqual({ detail: 'Target category not found.' });
    expect((await rowsOf<{ category_id: string }>('transactions')).map((t) => t.category_id)).toEqual([CAT, CAT]);

    const ok = await call(`/api/v1/categories/${CAT}?reassign_to_category_id=${FOOD}`, { method: 'DELETE' });
    expect(ok.status).toBe(204);
    expect(await oneRow('transactions', 'id = ?', t1)).toMatchObject({ category_id: FOOD, note: 'keep me', amount: 10000 });
    expect(await oneRow('transactions', 'id = ?', t2)).toMatchObject({ category_id: FOOD });
    expect(await oneRow('categories', 'id = ?', CAT)).toBeNull();
  });
});

describe('/budget', () => {
  const seedRow = () =>
    testDb()
      .prepare('INSERT INTO budgets (id, user_id, monthly_budget, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind('b1', USER_ID, 2500000, '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')
      .run();

  it('GET returns null budget when none exists, else decimal strings and Z timestamps', async () => {
    expect(await (await call('/api/v1/budget')).json()).toEqual({ budget: null });
    await seedRow();
    expect(await (await call('/api/v1/budget')).json()).toEqual({
      budget: { id: 'b1', user_id: USER_ID, monthly_budget: '25000.00', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' },
    });
  });

  it('PATCH updates the monthly budget and ignores daily_amount from old app builds', async () => {
    await seedRow();
    const res = await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '30000.00', daily_amount: '999' } });
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body).toMatchObject({ monthly_budget: '30000.00' });
    expect(body).not.toHaveProperty('daily_budget');
    expect(await oneRow('budgets', 'user_id = ?', USER_ID)).toMatchObject({ monthly_budget: 3000000 });
  });

  it('PATCH on first save inserts the row', async () => {
    const res = await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '10' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ monthly_budget: '10.00' });
    expect(await rowsOf('budgets')).toHaveLength(1);
    await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '20' } });
    expect(await rowsOf('budgets')).toHaveLength(1);
    expect(await oneRow('budgets', 'user_id = ?', USER_ID)).toMatchObject({ monthly_budget: 2000 });
  });

  it('PATCH requires the monthly amount, and amounts must be >= 0', async () => {
    const none = await call('/api/v1/budget', { method: 'PATCH', json: { daily_amount: '5' } });
    expect(none.status).toBe(422);
    expect((await call('/api/v1/budget', { method: 'PATCH', json: { monthly_amount: '-5' } })).status).toBe(422);
  });

  it('GET /budget/categories lists the caller items', async () => {
    await seedCustom();
    await seedUser(OTHER);
    await seedCategoryBudget(CAT, '50');
    await seedCategoryBudget(FOOD, '12.5');
    await seedCategoryBudget(FOOD, '99', OTHER);
    const body = await (await call('/api/v1/budget/categories')).json<{ items: { category_id: string; monthly_amount: string }[] }>();
    expect(body.items.sort((a, b) => a.category_id.localeCompare(b.category_id))).toEqual([
      { category_id: CAT, monthly_amount: '50.00' },
      { category_id: FOOD, monthly_amount: '12.50' },
    ]);
  });

  it('PUT /budget/categories/{id} sets the budget; amount must be > 0', async () => {
    await seedCustom();
    const res = await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '2500.00' } });
    expect(await res.json()).toEqual({ category_id: CAT, monthly_amount: '2500.00' });
    expect((await budgetOf(CAT))?.monthly_amount).toBe(250000);
    // Setting it again replaces it; system categories are allowed too.
    await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '10' } });
    expect((await budgetOf(CAT))?.monthly_amount).toBe(1000);
    expect((await call(`/api/v1/budget/categories/${FOOD}`, { method: 'PUT', json: { monthly_amount: '7' } })).status).toBe(200);
    expect((await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '0' } })).status).toBe(422);
  });

  it('PUT/DELETE on an invisible or malformed category id is 404', async () => {
    await seedUser(OTHER);
    await seedCategory({ id: STRANGER, user_id: OTHER, name: 'Theirs' });
    for (const id of [CAT, STRANGER]) {
      const put = await call(`/api/v1/budget/categories/${id}`, { method: 'PUT', json: { monthly_amount: '5' } });
      expect(put.status).toBe(404);
      expect(await put.json()).toEqual({ detail: 'Category not found.' });
    }
    expect((await call('/api/v1/budget/categories/nope', { method: 'DELETE' })).status).toBe(404);
    expect((await call('/api/v1/budget/categories/nope', { method: 'PUT', json: { monthly_amount: '5' } })).status).toBe(404);
  });

  it('DELETE /budget/categories/{id} removes the budget and returns 204', async () => {
    await seedCustom();
    await seedCategoryBudget(CAT, '25');
    const res = await call(`/api/v1/budget/categories/${CAT}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await budgetOf(CAT)).toBeNull();
    // Deleting a budget that does not exist is still 204.
    expect((await call(`/api/v1/budget/categories/${CAT}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('other failures become 502 with the Python messages', async () => {
    await seedCustom();
    const env = { ...makeEnv(), DB: failingDb('batch') } as unknown as Bindings;
    const res = await call(`/api/v1/budget/categories/${CAT}`, { method: 'PUT', json: { monthly_amount: '5' }, env });
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
  it('decimalToCents is exact', () => {
    expect(decimalToCents('500')).toBe(50000);
    expect(decimalToCents('0.1')).toBe(10);
    expect(decimalToCents('1.005')).toBe(100); // half-even at the third decimal
    expect(decimalToCents('99999999999.99')).toBe(9999999999999);
    expect(decimalToCents(500.5)).toBe(50050);
    expect(() => decimalToCents('abc')).toThrow();
  });
});
