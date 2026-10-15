import { afterEach, describe, expect, it, vi } from 'vitest';

import { postDueRecurring } from '../src/features/recurring/poster';
import { dueInstantMs, firstDueFrom, nextAfter, parseDateKey } from '../src/features/recurring/schedule';
import { USER_ID, call, makeEnv, signToken } from './helpers';
import { oneRow, rowsOf, seedBudget, seedCategory, seedTransaction, seedUser, testDb, uid } from './db';

/** Seeded recurring system categories (migration 0007): "Salary" (income), "Other expense", "Utilities", "Rent". */
const SALARY = 'f48bfe4a-8f08-4229-b977-e1292b11490f';
const OTHER_EXPENSE = '6158972c-10bc-4104-8e72-b7ccfc439bf7';
const UTILITIES = '18102b0b-d5fa-4cfc-a206-5292332054a1';
const RENT = '94b82777-eee4-46de-8c18-7490bda02b60';
const OTHER = '22222222-2222-2222-2222-222222222222';
const IST = 'Asia/Kolkata';
/** 13:30 IST on Sat 10 Oct 2026. 06:00 IST is 00:30 UTC. */
const NOW = Date.UTC(2026, 9, 10, 8, 0, 0);
const at = (y: number, m: number, d: number, h = 0, min = 30) => Date.UTC(y, m - 1, d, h, min, 0);

afterEach(() => vi.useRealTimers());

const setNow = (ms: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ms);
};

interface Item {
  id: string;
  kind: string;
  name: string;
  amount: string;
  category_id: string | null;
  category: string | null;
  cadence: string;
  day_of_month: number;
  month_of_year: number | null;
  timezone: string;
  next_due_date: string;
  active: boolean;
  note: string | null;
  monthly_equivalent: string;
  created_at: string;
  updated_at: string;
}
interface Listing {
  items: Item[];
  summary: { monthly_income_total: string; monthly_subscriptions_total: string };
}
interface Tx {
  id: string;
  amount: number;
  type: string;
  transaction_at: string;
  payment_hash: string | null;
  recurring_item_id: string | null;
  counterparty_name: string;
  category_id: string | null;
  detected_via: string;
  note: string | null;
  deleted_at: string | null;
}

const salary = (over: Record<string, unknown> = {}) => ({
  kind: 'income',
  name: 'Salary',
  amount: '50000',
  cadence: 'monthly',
  day_of_month: 1,
  timezone: IST,
  ...over,
});

async function create(body: Record<string, unknown>, token?: string) {
  const res = await call('/api/v1/recurring', { method: 'POST', json: body, env: makeEnv({ WRITE_LIMITER: undefined }), ...(token ? { token } : {}) });
  return { res, item: await res.json<Item>() };
}
const txs = () => rowsOf<Tx>('transactions', '1 = 1');
const cron = (ms: number) => postDueRecurring(makeEnv(), ms);
const nextDue = async (id: string) => (await oneRow<{ next_due_date: string }>('recurring_items', 'id = ?', id))?.next_due_date;

/** Insert an item directly (to start from a chosen next_due_date). */
async function seedItem(over: Partial<Record<string, string | number | null>> = {}): Promise<string> {
  const id = uid();
  const row = {
    id,
    user_id: USER_ID,
    kind: 'subscription',
    name: 'Netflix',
    amount: 64900,
    category_id: null,
    cadence: 'monthly',
    day_of_month: 15,
    month_of_year: null,
    timezone: IST,
    next_due_date: '2026-10-15',
    active: 1,
    note: null,
    ...over,
  };
  await testDb()
    .prepare(
      `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, month_of_year, timezone, next_due_date, active, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.user_id, row.kind, row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.active, row.note)
    .run();
  return id;
}

describe('schedule math', () => {
  const monthly = (day: number) => ({ cadence: 'monthly' as const, day_of_month: day, month_of_year: null });

  it('a 31st clamps to the last day of short months and returns to the 31st', () => {
    let due = parseDateKey('2026-01-31');
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      due = nextAfter(monthly(31), due);
      seen.push(`${due.year}-${due.month}-${due.day}`);
    }
    expect(seen).toEqual(['2026-2-28', '2026-3-31', '2026-4-30', '2026-5-31']);
    expect(nextAfter(monthly(29), parseDateKey('2028-01-29'))).toEqual({ year: 2028, month: 2, day: 29 }); // leap year
    expect(nextAfter(monthly(15), parseDateKey('2026-12-15'))).toEqual({ year: 2027, month: 1, day: 15 });
  });

  it('yearly: Feb 29 falls back to Feb 28 in common years', () => {
    const yearly = { cadence: 'yearly' as const, day_of_month: 29, month_of_year: 2 };
    expect(nextAfter(yearly, parseDateKey('2028-02-29'))).toEqual({ year: 2029, month: 2, day: 28 });
    expect(nextAfter(yearly, parseDateKey('2027-02-28'))).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('firstDueFrom never returns a past date; today still counts', () => {
    expect(firstDueFrom(monthly(10), IST, NOW)).toEqual({ year: 2026, month: 10, day: 10 });
    expect(firstDueFrom(monthly(9), IST, NOW)).toEqual({ year: 2026, month: 11, day: 9 });
    expect(firstDueFrom(monthly(10), IST, NOW, true)).toEqual({ year: 2026, month: 11, day: 10 });
  });

  it('a due date is posted at 06:00 local (IST = 00:30 UTC)', () => {
    expect(new Date(dueInstantMs(IST, { year: 2026, month: 10, day: 15 })).toISOString()).toBe('2026-10-15T00:30:00.000Z');
  });
});

describe('CRUD and isolation', () => {
  it('401 without a token on every route', async () => {
    for (const [method, path] of [
      ['GET', '/api/v1/recurring'],
      ['POST', '/api/v1/recurring'],
      ['PATCH', `/api/v1/recurring/${uid()}`],
      ['DELETE', `/api/v1/recurring/${uid()}`],
    ] as const) {
      expect((await call(path, { method, token: false })).status, `${method} ${path}`).toBe(401);
    }
  });

  it('create, list (with summary and kind filter), patch, delete', async () => {
    setNow(NOW);
    const { res, item } = await create(salary({ day_of_month: 25, note: '  paid by employer  ' }));
    expect(res.status).toBe(201);
    expect(item).toMatchObject({
      kind: 'income',
      name: 'Salary',
      amount: '50000.00',
      category_id: SALARY,
      category: 'Salary',
      cadence: 'monthly',
      day_of_month: 25,
      month_of_year: null,
      timezone: IST,
      next_due_date: '2026-10-25',
      active: true,
      note: 'paid by employer',
      monthly_equivalent: '50000.00',
    });
    expect(item.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    await create({ kind: 'subscription', name: 'Netflix', amount: '649', cadence: 'monthly', day_of_month: 12, timezone: IST });
    await create({ kind: 'subscription', name: 'Domain', amount: '1000', cadence: 'yearly', day_of_month: 3, month_of_year: 11, timezone: IST });
    await create({ kind: 'subscription', name: 'Gym', amount: '999', cadence: 'monthly', day_of_month: 2, timezone: IST, active: false });

    const all = await (await call('/api/v1/recurring')).json<Listing>();
    // Ordered by kind, then next_due_date, then name.
    expect(all.items.map((i) => i.name)).toEqual(['Salary', 'Netflix', 'Gym', 'Domain']);
    // Monthly equivalents: 649.00 + 1000/12 = 83.33 (the paused Gym is left out).
    expect(all.summary).toEqual({ monthly_income_total: '50000.00', monthly_subscriptions_total: '732.33' });
    expect(all.items.find((i) => i.name === 'Domain')).toMatchObject({ monthly_equivalent: '83.33', next_due_date: '2026-11-03', category_id: OTHER_EXPENSE });

    const subs = await (await call('/api/v1/recurring?kind=subscription')).json<Listing>();
    expect(subs.items.map((i) => i.kind)).toEqual(['subscription', 'subscription', 'subscription']);
    expect(subs.summary.monthly_income_total).toBe('50000.00'); // the summary ignores the filter
    expect((await call('/api/v1/recurring?kind=bogus')).status).toBe(422);

    const patched = await call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', json: { name: 'Pay', amount: '55000.50', note: null } });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: item.id, name: 'Pay', amount: '55000.50', note: null, next_due_date: '2026-10-25' });

    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', json: { name: 'x' } })).status).toBe(404);
  });

  it('users never see or touch each other items', async () => {
    setNow(NOW);
    await seedUser(OTHER);
    const { item } = await create(salary());
    const theirs = await signToken({ sub: OTHER });
    expect((await (await call('/api/v1/recurring', { token: theirs })).json<Listing>()).items).toEqual([]);
    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', token: theirs, json: { name: 'x' } })).status).toBe(404);
    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'DELETE', token: theirs })).status).toBe(404);
    expect(await oneRow('recurring_items', 'id = ?', item.id)).toMatchObject({ name: 'Salary' });
  });

  it('categories: income defaults to Salary, subscriptions to Other expense, scopes are enforced, an unknown or foreign category is a 400', async () => {
    setNow(NOW);
    await seedUser(OTHER);
    const mine = await seedCategory({ name: 'Streaming' });
    const foreign = await seedCategory({ name: 'Secret', user_id: OTHER });
    const sub = { kind: 'subscription', name: 'Netflix', amount: '9', cadence: 'monthly', day_of_month: 1, timezone: IST };
    expect((await create(sub)).item).toMatchObject({ category_id: OTHER_EXPENSE, category: 'Other expense' });
    expect((await create({ ...sub, category_id: RENT })).item).toMatchObject({ category_id: RENT, category: 'Rent' });
    // Old app builds send a spending category: it maps to the nearest recurring one.
    expect((await create({ ...sub, category_id: mine })).item.category_id).toBe(OTHER_EXPENSE);
    expect((await create({ ...sub, category_id: '85bf877a-f8b1-4b07-a9fb-5e8c809907ae' })).item.category_id).toBe(OTHER_EXPENSE);
    expect((await create({ ...sub, category_id: 'ad296c59-42ec-49e5-b824-c011c5b1b28b' })).item.category_id).toBe(UTILITIES);
    expect((await create(salary({ category_id: '2aedfd2c-7a2d-48e9-9b9c-8918dd4e9715' }))).item.category_id).toBe(SALARY);
    // The wrong recurring scope is a client error.
    expect((await create({ ...sub, category_id: SALARY })).res.status).toBe(400);
    expect((await create(salary({ category_id: RENT }))).res.status).toBe(400);
    expect((await create(salary({ category_id: foreign }))).res.status).toBe(400);
    expect((await create(salary({ category_id: uid() }))).res.status).toBe(400);
  });

  it('validation', async () => {
    const status = async (over: Record<string, unknown>) => (await create(salary(over))).res.status;
    const yearlyNoMonth = await create(salary({ cadence: 'yearly' }));
    expect(yearlyNoMonth.res.status).toBe(422);
    expect(JSON.stringify(yearlyNoMonth.item)).toContain('month_of_year');
    expect(await status({ cadence: 'weekly' })).toBe(422);
    expect(await status({ day_of_month: 0 })).toBe(422);
    expect(await status({ day_of_month: 32 })).toBe(422);
    expect(await status({ day_of_month: 1.5 })).toBe(422);
    expect(await status({ cadence: 'yearly', month_of_year: 13 })).toBe(422);
    expect(await status({ amount: '0' })).toBe(422);
    expect(await status({ amount: '-5' })).toBe(422);
    expect(await status({ amount: '0.001' })).toBe(422);
    expect(await status({ amount: '12345678901' })).toBe(422); // 11 whole digits
    expect(await status({ name: '   ' })).toBe(422);
    expect(await status({ kind: 'loan' })).toBe(422);
    expect(await status({ timezone: 'Mars/Base' })).toBe(400);
    expect(await status({ amount: '9999999999.99' })).toBe(201); // 10 whole digits is the maximum
    expect(await status({ day_of_month: 31 })).toBe(201);
    expect(await status({ cadence: 'yearly', month_of_year: 2 })).toBe(201);
    // PATCH: switching to yearly needs a month; kind cannot change.
    const { item } = await create(salary());
    const patch = (json: unknown) => call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', json });
    expect((await patch({ cadence: 'yearly' })).status).toBe(422);
    expect((await patch({ cadence: 'yearly', month_of_year: 4 })).status).toBe(200);
    expect((await patch({ day_of_month: 40 })).status).toBe(422);
    expect((await patch({ kind: 'subscription' })).status).toBe(200);
    expect((await oneRow<{ kind: string }>('recurring_items', 'id = ?', item.id))?.kind).toBe('income');
  });
});

describe('creating: never backfill', () => {
  it('due day still ahead: next_due_date is this period', async () => {
    setNow(NOW);
    expect((await create(salary({ day_of_month: 15 }))).item.next_due_date).toBe('2026-10-15');
    expect((await create(salary({ day_of_month: 15, post_current_period: true }))).item.next_due_date).toBe('2026-10-15');
    expect(await txs()).toHaveLength(0);
  });

  it('due day passed, post_current_period false: waits for the next period, nothing posted', async () => {
    setNow(NOW);
    const { item } = await create(salary({ day_of_month: 5 }));
    expect(item.next_due_date).toBe('2026-11-05');
    expect(await txs()).toHaveLength(0);
  });

  it('due day passed, post_current_period true: posts this period now and waits for the next', async () => {
    setNow(NOW);
    const { item } = await create(salary({ day_of_month: 5, post_current_period: true }));
    expect(item.next_due_date).toBe('2026-11-05');
    const rows = await txs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 5000000,
      type: 'credit',
      counterparty_name: 'Salary',
      category_id: SALARY,
      detected_via: 'manual',
      recurring_item_id: item.id,
      payment_hash: `recurring:${item.id}:2026-10-05`,
      transaction_at: '2026-10-05T00:30:00.000Z',
    });
    // The cron has nothing left for this period.
    expect(await cron(NOW)).toEqual({ due: 0, posted: 0 });
    expect(await txs()).toHaveLength(1);
  });

  it('a paused item posts nothing; an item due today is left to the cron', async () => {
    setNow(NOW);
    await create(salary({ day_of_month: 5, post_current_period: true, active: false }));
    expect(await txs()).toHaveLength(0);
    const today = await create(salary({ name: 'Today', day_of_month: 10, post_current_period: true }));
    expect(today.item.next_due_date).toBe('2026-10-10');
    expect(await txs()).toHaveLength(0);
    expect(await cron(NOW)).toEqual({ due: 1, posted: 1 });
  });

  it('yearly items', async () => {
    setNow(NOW);
    expect((await create(salary({ cadence: 'yearly', month_of_year: 3, day_of_month: 1 }))).item.next_due_date).toBe('2027-03-01');
    expect((await create(salary({ cadence: 'yearly', month_of_year: 12, day_of_month: 25 }))).item.next_due_date).toBe('2026-12-25');
    const posted = await create(salary({ name: 'Bonus', cadence: 'yearly', month_of_year: 3, day_of_month: 1, post_current_period: true }));
    expect(posted.item.next_due_date).toBe('2027-03-01');
    expect((await txs())[0]).toMatchObject({ transaction_at: '2026-03-01T00:30:00.000Z', payment_hash: `recurring:${posted.item.id}:2026-03-01` });
  });
});

describe('the cron', () => {
  it('posts at 06:00 local of the item timezone, not before, and then moves one period on', async () => {
    setNow(NOW);
    const { item } = await create({ kind: 'subscription', name: 'Netflix', amount: '649', cadence: 'monthly', day_of_month: 15, timezone: IST, note: 'family plan' });
    expect(await cron(at(2026, 10, 14, 19, 0))).toEqual({ due: 0, posted: 0 }); // 00:30 IST on the 15th
    expect(await cron(at(2026, 10, 15, 0, 29))).toEqual({ due: 0, posted: 0 }); // 05:59 IST
    expect(await txs()).toHaveLength(0);

    expect(await cron(at(2026, 10, 15, 0, 30))).toEqual({ due: 1, posted: 1 }); // 06:00 IST
    const rows = await txs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      amount: 64900,
      type: 'debit',
      counterparty_name: 'Netflix',
      detected_via: 'manual',
      note: 'family plan',
      recurring_item_id: item.id,
      transaction_at: '2026-10-15T00:30:00.000Z',
      payment_hash: `recurring:${item.id}:2026-10-15`,
    });
    expect(await nextDue(item.id)).toBe('2026-11-15');
  });

  it('a Los Angeles item is due at 06:00 PDT (13:00 UTC), not at UTC midnight', async () => {
    await seedItem({ timezone: 'America/Los_Angeles', next_due_date: '2026-10-15' });
    expect(await cron(at(2026, 10, 15, 6, 0))).toEqual({ due: 0, posted: 0 }); // 23:00 PDT on the 14th
    expect(await cron(at(2026, 10, 15, 12, 59))).toEqual({ due: 0, posted: 0 });
    expect(await cron(at(2026, 10, 15, 13, 0))).toEqual({ due: 1, posted: 1 });
  });

  it('is idempotent: running twice posts one transaction; a post whose advance was lost is not doubled', async () => {
    const id = await seedItem();
    const now = at(2026, 10, 15);
    await cron(now);
    await cron(now);
    expect(await txs()).toHaveLength(1);
    await testDb().prepare("UPDATE recurring_items SET next_due_date = '2026-10-15' WHERE id = ?").bind(id).run();
    expect(await cron(now)).toEqual({ due: 1, posted: 0 }); // the hash already exists: nothing new, but it advances
    expect(await txs()).toHaveLength(1);
    expect(await nextDue(id)).toBe('2026-11-15');
  });

  it('day 31 clamps to Feb 28 and is back on the 31st in March', async () => {
    const id = await seedItem({ day_of_month: 31, next_due_date: '2026-01-31' });
    await cron(at(2026, 1, 31));
    expect(await nextDue(id)).toBe('2026-02-28');
    await cron(at(2026, 2, 28));
    expect(await nextDue(id)).toBe('2026-03-31');
    expect((await txs()).map((t) => t.transaction_at)).toEqual(['2026-01-31T00:30:00.000Z', '2026-02-28T00:30:00.000Z']);
  });

  it('yearly items post once a year', async () => {
    const id = await seedItem({ cadence: 'yearly', month_of_year: 3, day_of_month: 1, next_due_date: '2027-03-01' });
    await cron(at(2027, 2, 28));
    expect(await txs()).toHaveLength(0);
    await cron(at(2027, 3, 1));
    expect(await txs()).toHaveLength(1);
    expect(await nextDue(id)).toBe('2028-03-01');
    await cron(at(2027, 9, 1));
    expect(await txs()).toHaveLength(1);
  });

  it('a paused item is skipped; resuming re-plans from today with no backfill', async () => {
    setNow(NOW);
    const { item } = await create({ kind: 'subscription', name: 'Gym', amount: '999', cadence: 'monthly', day_of_month: 15, timezone: IST });
    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', json: { active: false } })).status).toBe(200);
    await cron(at(2026, 10, 20));
    expect(await txs()).toHaveLength(0);

    setNow(at(2026, 12, 20, 8, 0));
    const resumed = await (await call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', json: { active: true } })).json<Item>();
    expect(resumed.next_due_date).toBe('2027-01-15');
    await cron(at(2026, 12, 20, 8, 0));
    expect(await txs()).toHaveLength(0);
  });

  it('edits apply from the next posting only; posted transactions are untouched', async () => {
    setNow(NOW);
    const { item } = await create({ kind: 'subscription', name: 'Netflix', amount: '649', cadence: 'monthly', day_of_month: 15, timezone: IST });
    await cron(at(2026, 10, 15));
    const patched = await call(`/api/v1/recurring/${item.id}`, { method: 'PATCH', json: { name: 'Netflix Premium', amount: '799' } });
    expect(patched.status).toBe(200);
    expect((await patched.json<Item>()).next_due_date).toBe('2026-11-15');
    expect((await txs())[0]).toMatchObject({ counterparty_name: 'Netflix', amount: 64900 });
    await cron(at(2026, 11, 15));
    const rows = await txs();
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ counterparty_name: 'Netflix Premium', amount: 79900 });
  });

  it('changing the day re-plans from today, but never double-posts a period that was already posted', async () => {
    setNow(NOW);
    const early = await create(salary({ day_of_month: 5, post_current_period: true })); // posted Oct 5, next Nov 5
    const moved = await (await call(`/api/v1/recurring/${early.item.id}`, { method: 'PATCH', json: { day_of_month: 20 } })).json<Item>();
    expect(moved.next_due_date).toBe('2026-11-20');

    const fresh = await create(salary({ name: 'Other', day_of_month: 5 })); // nothing posted, next Nov 5
    const replanned = await (await call(`/api/v1/recurring/${fresh.item.id}`, { method: 'PATCH', json: { day_of_month: 20 } })).json<Item>();
    expect(replanned.next_due_date).toBe('2026-10-20');
  });

  it('delete keeps the posted transactions and stops the item', async () => {
    setNow(NOW);
    const { item } = await create(salary({ day_of_month: 5, post_current_period: true }));
    expect((await call(`/api/v1/recurring/${item.id}`, { method: 'DELETE' })).status).toBe(204);
    const rows = await txs();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.recurring_item_id).toBeNull();
    await cron(at(2026, 11, 5));
    expect(await txs()).toHaveLength(1);
  });

  it('a posted transaction the user deleted is not posted again', async () => {
    const id = await seedItem();
    await cron(at(2026, 10, 15));
    const [tx] = await txs();
    expect((await call(`/api/v1/transactions/${tx?.id ?? ''}`, { method: 'DELETE' })).status).toBe(204);
    await cron(at(2026, 10, 15, 6, 0));
    await cron(at(2026, 10, 20));
    expect(await txs()).toHaveLength(1);
    expect(await nextDue(id)).toBe('2026-11-15');
  });

  it('catches up one period per run, oldest first', async () => {
    const id = await seedItem({ next_due_date: '2026-08-15' });
    const now = at(2026, 10, 20);
    await cron(now);
    expect((await txs()).map((t) => t.transaction_at)).toEqual(['2026-08-15T00:30:00.000Z']);
    expect(await nextDue(id)).toBe('2026-09-15');
    await cron(now);
    await cron(now);
    expect((await txs()).map((t) => t.transaction_at.slice(0, 10))).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
    expect(await nextDue(id)).toBe('2026-11-15');
    expect(await cron(now)).toEqual({ due: 0, posted: 0 });
  });

  it('a failing item does not stop the others; a debit runs the budget alerts like a manual one', async () => {
    await seedBudget({ monthly: '500' });
    await seedItem({ name: 'Broken', timezone: 'Not/AZone' });
    await seedItem({ name: 'Netflix', amount: 64900 });
    expect(await cron(at(2026, 10, 15))).toEqual({ due: 1, posted: 1 });
    expect((await txs()).map((t) => t.counterparty_name)).toEqual(['Netflix']);
    expect((await rowsOf('notifications')).length).toBeGreaterThan(0);
  });
});

describe('GET /recurring/month', () => {
  interface Occurrence {
    id: string;
    kind: string;
    name: string;
    amount: string;
    category: { id: string; name: string; scope: string } | null;
    due_date: string;
    status: string;
    transaction_id?: string;
    posted_amount?: string;
  }
  interface Month {
    year: number;
    month: number;
    items: Occurrence[];
    totals: Record<string, string>;
  }
  const month = async (y: number, m: number) => (await call(`/api/v1/recurring/month?year=${y}&month=${m}`)).json<Month>();

  it('reports paid, skipped and upcoming occurrences with totals; yearly items outside the month and paused unposted ones are omitted', async () => {
    const rent = await seedItem({ name: 'Rent', amount: 1500000, category_id: RENT, day_of_month: 1, next_due_date: '2026-11-01' });
    const rentTx = await seedTransaction({ amount: '15000', category_id: RENT, counterparty_name: 'Rent', recurring_item_id: rent, transaction_at: '2026-09-30T18:30:00.000Z' });
    const gym = await seedItem({ name: 'Gym', amount: 100000, category_id: OTHER_EXPENSE, day_of_month: 5, next_due_date: '2026-11-05' });
    await seedTransaction({ amount: '1000', category_id: OTHER_EXPENSE, counterparty_name: 'Gym', recurring_item_id: gym, transaction_at: '2026-10-05T00:30:00.000Z', deleted_at: '2026-10-06T00:00:00.000Z' });
    await seedItem({ name: 'Netflix', amount: 64900, category_id: OTHER_EXPENSE, day_of_month: 15, next_due_date: '2026-10-15' });
    await seedItem({ name: 'Insurance', amount: 1200000, category_id: UTILITIES, cadence: 'yearly', month_of_year: 10, day_of_month: 20, next_due_date: '2026-10-20' });
    await seedItem({ name: 'Domain', amount: 90000, cadence: 'yearly', month_of_year: 3, day_of_month: 9, next_due_date: '2027-03-09' });
    await seedItem({ name: 'Paused', amount: 5000, active: 0, day_of_month: 25, next_due_date: '2026-10-25' });
    const pay = await seedItem({ kind: 'income', name: 'Salary', amount: 5000000, category_id: SALARY, day_of_month: 1, next_due_date: '2026-11-01' });
    const payTx = await seedTransaction({ amount: '50000', type: 'credit', category_id: SALARY, counterparty_name: 'Salary', recurring_item_id: pay, transaction_at: '2026-09-30T18:30:00.000Z' });
    await seedItem({ kind: 'income', name: 'Rent income', amount: 800000, category_id: SALARY, day_of_month: 28, next_due_date: '2026-10-28' });

    const body = await month(2026, 10);
    expect(body.items.map((i) => [i.name, i.due_date, i.status])).toEqual([
      ['Rent', '2026-10-01', 'paid'],
      ['Salary', '2026-10-01', 'paid'],
      ['Gym', '2026-10-05', 'skipped'],
      ['Netflix', '2026-10-15', 'upcoming'],
      ['Insurance', '2026-10-20', 'upcoming'],
      ['Rent income', '2026-10-28', 'upcoming'],
    ]);
    expect(body.items[0]).toMatchObject({ id: rent, kind: 'subscription', amount: '15000.00', transaction_id: rentTx, posted_amount: '15000.00', category: { name: 'Rent', scope: 'recurring_expense' } });
    expect(body.items[1]).toMatchObject({ kind: 'income', transaction_id: payTx, category: { name: 'Salary', scope: 'recurring_income' } });
    expect(body.items[2]).not.toHaveProperty('transaction_id');
    expect(body.totals).toEqual({
      fixed_expense_paid: '15000.00',
      fixed_expense_upcoming: '12649.00',
      fixed_income_received: '50000.00',
      fixed_income_upcoming: '8000.00',
    });
  });

  it('a paid occurrence reports the amount it was posted with, not the item\'s current amount', async () => {
    const id = await seedItem({ name: 'Netflix', amount: 79900, day_of_month: 15, next_due_date: '2026-11-15' });
    await seedTransaction({ amount: '649', counterparty_name: 'Netflix', recurring_item_id: id, transaction_at: '2026-10-15T00:30:00.000Z' });
    const [row] = (await month(2026, 10)).items;
    expect(row).toMatchObject({ status: 'paid', amount: '799.00', posted_amount: '649.00' });
  });

  it('does not backfill months before the item existed; months after it are upcoming', async () => {
    await seedItem({ name: 'Netflix', amount: 64900, day_of_month: 15, next_due_date: '2026-10-15' });
    expect((await month(2026, 9)).items).toEqual([]);
    expect((await month(2026, 12)).items.map((i) => [i.due_date, i.status])).toEqual([['2026-12-15', 'upcoming']]);
  });

  it('matches postings to the item\'s own timezone month (a late-evening UTC row belongs to the next local month)', async () => {
    const id = await seedItem({ name: 'Rent', amount: 1500000, day_of_month: 1, next_due_date: '2026-12-01' });
    // 2026-11-01 06:00 IST is 2026-11-01T00:30Z; a September-30 18:30Z row is October 1 00:00 IST.
    await seedTransaction({ amount: '15000', recurring_item_id: id, transaction_at: '2026-09-30T18:45:00.000Z' });
    expect((await month(2026, 10)).items.map((i) => i.status)).toEqual(['paid']);
    expect((await month(2026, 9)).items).toEqual([]);
  });

  it('a yearly item posted in another month of its year still shows as paid in its due month', async () => {
    const id = await seedItem({ name: 'Insurance', amount: 1200000, category_id: UTILITIES, cadence: 'yearly', month_of_year: 10, day_of_month: 20, next_due_date: '2027-10-20' });
    // Posted early, in August ("post now"): next_due_date has already moved to next year.
    await seedTransaction({ amount: '12000', category_id: UTILITIES, counterparty_name: 'Insurance', recurring_item_id: id, transaction_at: '2026-08-10T06:00:00.000Z' });
    const body = await month(2026, 10);
    expect(body.items.map((i) => [i.name, i.status])).toEqual([['Insurance', 'paid']]);
    expect(body.totals.fixed_expense_paid).toBe('12000.00');
  });

  it('only returns the caller\'s items and validates the query', async () => {
    await seedUser(OTHER);
    await seedItem({ user_id: OTHER, name: 'Theirs', day_of_month: 15, next_due_date: '2026-10-15' });
    expect((await month(2026, 10)).items).toEqual([]);
    expect((await call('/api/v1/recurring/month?year=2026&month=13')).status).toBe(422);
    expect((await call('/api/v1/recurring/month?year=2026&month=10', { token: false })).status).toBe(401);
  });
});
