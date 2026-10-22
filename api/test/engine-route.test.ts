import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EngineProfile } from '../src/features/engine/patterns';
import type { ForecastResponse } from '../src/features/engine/schemas';
import { runEngineForUser } from '../src/features/engine/job';
import { markEngineDirty } from '../src/features/engine/dirty';
import { USER_ID, call, makeEnv } from './helpers';
import { failingOn, oneRow, seedBudget, seedCategory, seedCategoryBudget, seedTransaction, seedUser, testDb, uid } from './db';

const DAY = 86_400_000;
const MINUTE = 60_000;
/** Thursday 2026-10-22, 03:00 UTC (08:30 IST). */
const NOW = Date.parse('2026-10-22T03:00:00.000Z');
const at = (daysAgo: number, now = NOW) => new Date(now - daysAgo * DAY).toISOString();
const IST = 'Asia/Kolkata';
const OTHER = '22222222-2222-2222-2222-222222222222';
/** Seeded system category "Rent" (migration 0007): a fixed (recurring) expense. */
const RENT = '94b82777-eee4-46de-8c18-7490bda02b60';

afterEach(() => vi.useRealTimers());

const setNow = (ms: number) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ms);
};

const get = (query = `year=2026&month=10&timezone=${encodeURIComponent(IST)}`, opts: Parameters<typeof call>[1] = {}) => call(`/api/v1/forecast?${query}`, opts);
const forecast = async (query?: string, opts?: Parameters<typeof call>[1]) => {
  const res = await get(query, opts);
  expect(res.status).toBe(200);
  return res.json<ForecastResponse>();
};
const num = (money: string | null) => Number(money);

async function seedItem(over: Partial<Record<string, string | number | null>> = {}): Promise<string> {
  const id = uid();
  const row = { id, user_id: USER_ID, kind: 'subscription', name: 'Netflix', amount: 64900, category_id: null, cadence: 'monthly', day_of_month: 24, month_of_year: null, timezone: IST, next_due_date: '2026-10-24', active: 1, ...over };
  await testDb()
    .prepare(
      `INSERT INTO recurring_items (id, user_id, kind, name, amount, category_id, cadence, day_of_month, month_of_year, timezone, next_due_date, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.user_id, row.kind, row.name, row.amount, row.category_id, row.cadence, row.day_of_month, row.month_of_year, row.timezone, row.next_due_date, row.active)
    .run();
  return id;
}

const profileOf = async () => JSON.parse((await oneRow<{ profile: string }>('engine_patterns', 'user_id = ?', USER_ID))!.profile) as EngineProfile;
const patternsRow = () => oneRow<{ version: number; dirty: number; computed_at: string; timezone: string | null }>('engine_patterns', 'user_id = ?', USER_ID);

/** A Swiggy order every 4 days for 80 days (food), six Croma purchases a month ago, and a Rs 4,000 Croma purchase yesterday. */
async function seedFull() {
  const food = await seedCategory({ name: 'Food', icon_name: 'Utensils', color: '#F97316' });
  for (let ago = 3; ago <= 79; ago += 4) await seedTransaction({ amount: '200', counterparty_name: 'Swiggy', category_id: food, transaction_at: at(ago) });
  for (const [i, rupees] of [1000, 1100, 900, 1050, 950, 1000].entries()) await seedTransaction({ amount: String(rupees), counterparty_name: 'Croma', transaction_at: at(30 + i) });
  const croma = await seedTransaction({ amount: '4000', counterparty_name: 'Croma', transaction_at: at(1) });
  for (const month of ['2026-08-01', '2026-09-01', '2026-10-01']) {
    await seedTransaction({ amount: '80000', type: 'credit', counterparty_name: 'Acme Corp', transaction_at: `${month}T04:00:00.000Z` });
  }
  return { food, croma };
}

describe('GET /api/v1/forecast: request handling', () => {
  it('needs a signed-in user', async () => {
    expect((await get(undefined, { token: false })).status).toBe(401);
  });

  it('rejects missing parameters (422) and an unknown timezone (400)', async () => {
    expect((await get('year=2026&month=10')).status).toBe(422);
    expect((await get('year=2026&month=13&timezone=Asia%2FKolkata')).status).toBe(422);
    const bad = await get('year=2026&month=10&timezone=Not%2FAZone');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ detail: "Invalid timezone: 'Not/AZone'" });
  });

  it('answers a future month with a 422', async () => {
    setNow(NOW);
    const res = await get('year=2026&month=11&timezone=Asia%2FKolkata');
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ detail: 'Forecasts cover the current month and earlier months.' });
    expect((await get('year=2027&month=1&timezone=Asia%2FKolkata')).status).toBe(422);
  });

  it('uses the month of the requested timezone as "now"', async () => {
    // 2026-10-31T20:00Z is already November 1 in Kolkata: November is the current month there, but still October in London.
    setNow(Date.parse('2026-10-31T20:00:00.000Z'));
    expect((await get('year=2026&month=11&timezone=Asia%2FKolkata')).status).toBe(200);
    expect((await get('year=2026&month=11&timezone=Europe%2FLondon')).status).toBe(422);
  });
});

describe('GET /api/v1/forecast: the current month', () => {
  it('returns the whole forecast for a user with history, a budget, a bill and an unusual spend', async () => {
    setNow(NOW);
    const { food, croma } = await seedFull();
    await seedBudget({ monthly: '30000' });
    const netflix = await seedItem();

    const body = await forecast();
    expect(Object.keys(body).sort()).toEqual(['accuracy', 'categories', 'historyDays', 'landing', 'mode', 'month', 'safeToday', 'summary', 'timezone', 'today', 'upcoming', 'watch', 'year']);
    expect(body).toMatchObject({ year: 2026, month: 10, today: '2026-10-22', timezone: IST, mode: 'full', accuracy: null });
    expect(body.historyDays).toBeGreaterThanOrEqual(80);

    // Spent so far: five Swiggy orders (1000) and the Croma purchase (4000), exactly the month summary's debit total.
    const summary = await (await call(`/api/v1/transactions/month-summary?year=2026&month=10&timezone=${encodeURIComponent(IST)}`)).json<{ debit_total: string }>();
    expect(body.landing).toMatchObject({ budget: '30000.00', spentSoFar: '5000.00', billsStillDue: '649.00' });
    expect(body.landing.spentSoFar).toBe(summary.debit_total);
    expect(num(body.landing.p10)).toBeLessThanOrEqual(num(body.landing.p50));
    expect(num(body.landing.p50)).toBeLessThanOrEqual(num(body.landing.p90));
    expect(num(body.landing.p50)).toBeCloseTo(5000 + 649 + num(body.landing.flexibleRemaining), 2);
    expect(body.landing.chanceUnder).toBeGreaterThanOrEqual(0);
    expect(body.landing.chanceUnder).toBeLessThanOrEqual(1);

    expect(body.safeToday).toMatchObject({ weekday: 'Thu' });
    expect(typeof body.safeToday?.amount).toBe('string');
    expect(typeof body.safeToday?.usualForWeekday).toBe('string');

    const foodRow = body.categories.find((c) => c.id === food);
    expect(foodRow).toMatchObject({ name: 'Food', iconName: 'Utensils', color: '#F97316', spent: '1000.00', budget: null });
    expect(foodRow?.baseline).not.toBeNull();
    expect(num(foodRow!.p50)).toBeGreaterThanOrEqual(1000);
    expect(body.categories.find((c) => c.id === null)).toMatchObject({ name: 'Uncategorized', spent: '4000.00' });

    // The salary credits (Aug 1, Sep 1, Oct 1) repeat every 30.5 days: the next one is expected on Oct 31 (IST).
    expect(body.upcoming.map((u) => [u.kind, u.name, u.date, u.amount])).toEqual([
      ['likely', 'Swiggy', '2026-10-23', '200.00'],
      ['bill', 'Netflix', '2026-10-24', '649.00'],
      ['income', 'Acme Corp', '2026-10-31', '80000.00'],
    ]);
    expect(body.upcoming[1]?.id).toBe(`bill:${netflix}:2026-10-24`);
    expect(body.upcoming[0]).toMatchObject({ id: 'likely:swiggy', payeeKey: 'swiggy', confidence: 0.67 });

    expect(body.watch.find((w) => w.kind === 'unusual')).toEqual({
      id: `unusual:${croma}`,
      kind: 'unusual',
      text: '₹4,000 at Croma is about 4x your usual there.',
      transactionId: croma,
      payeeKey: 'croma',
      amount: '4000.00',
    });
    expect(body.summary.length).toBeGreaterThan(10);
  });

  it('counts fixed spend (rent) in spent so far but keeps it out of the flexible baseline', async () => {
    setNow(NOW);
    await seedFull();
    const before = await forecast();
    await seedTransaction({ amount: '10000', counterparty_name: 'Landlord', category_id: RENT, transaction_at: at(5) });
    await runEngineForUser(makeEnv(), USER_ID, NOW);
    const after = await forecast();
    expect(num(after.landing.spentSoFar) - num(before.landing.spentSoFar)).toBe(10000);
    expect(after.categories.find((c) => c.id === RENT)).toBeUndefined(); // rent is not an everyday spend category
    expect(num(after.landing.flexibleRemaining)).toBe(num(before.landing.flexibleRemaining));
  });

  it('reports a hot category and an over-budget category with their budgets', async () => {
    setNow(NOW);
    const { food } = await seedFull();
    await seedCategoryBudget(food, '1200');
    // A big food spend this month pushes the projection past both the budget and 1.25x the usual.
    await seedTransaction({ amount: '6000', counterparty_name: 'Banquet', category_id: food, transaction_at: at(2) });
    await seedBudget({ monthly: '30000' });
    const body = await forecast();
    const row = body.categories.find((c) => c.id === food);
    expect(row).toMatchObject({ budget: '1200.00', status: 'over', spent: '7000.00' });
    const hot = body.watch.find((w) => w.kind === 'category_hot');
    expect(hot).toMatchObject({ id: `hot:${food}`, categoryId: food });
    expect(hot?.text).toContain('Food is heading for');
    expect(hot?.text).toContain('over its ₹1,200 budget');
    expect(hot?.text).toContain('Banquet');
    expect(body.summary).toContain('Watch Food');
  });

  it('has no chance, safe amount or budget without a budget', async () => {
    setNow(NOW);
    await seedFull();
    const body = await forecast();
    expect(body.landing).toMatchObject({ budget: null, chanceUnder: null });
    expect(body.safeToday?.amount).toBeNull();
    expect(num(body.safeToday!.usualForWeekday)).toBeGreaterThanOrEqual(0);
    expect(body.summary).toMatch(/^On pace for about /);
  });

  it('treats a budget of zero as none', async () => {
    setNow(NOW);
    await seedFull();
    await seedBudget({ monthly: '0' });
    expect((await forecast()).landing.budget).toBeNull();
  });

  it('is the learning forecast for a brand-new user: straight line, no likely spends, a learning summary', async () => {
    setNow(NOW);
    for (const ago of [3, 2, 1]) await seedTransaction({ amount: '300', transaction_at: at(ago) });
    await seedBudget({ monthly: '10000' });
    const body = await forecast();
    expect(body).toMatchObject({ mode: 'learning', historyDays: 3 });
    expect(body.summary).toBe('Learning your patterns (3 of 30 days). ₹900 spent so far this month.');
    // 900 over four days (3 complete + today) = 225 a day, ten days left counting today.
    expect(body.landing.spentSoFar).toBe('900.00');
    expect(num(body.landing.flexibleRemaining)).toBeCloseTo(225 * 10, 2);
    expect(body.upcoming.filter((u) => u.kind === 'likely')).toEqual([]);
    expect(body.watch).toEqual([]);
  });

  it('has a forecast for a user with nothing at all', async () => {
    setNow(NOW);
    const body = await forecast();
    expect(body).toMatchObject({ mode: 'learning', historyDays: 0, categories: [], upcoming: [], watch: [] });
    expect(body.landing).toMatchObject({ p10: '0.00', p50: '0.00', p90: '0.00', spentSoFar: '0.00' });
  });

  it('is the warming forecast with 14 to 29 days of history', async () => {
    setNow(NOW);
    for (let ago = 1; ago <= 20; ago++) await seedTransaction({ amount: '100', transaction_at: at(ago) });
    const body = await forecast();
    expect(body).toMatchObject({ mode: 'warming', historyDays: 20 });
  });

  it('is deterministic within a day', async () => {
    setNow(NOW);
    await seedFull();
    expect(await forecast()).toEqual(await forecast());
  });

  it('on the last day of the month only the rest of today is left', async () => {
    setNow(Date.parse('2026-10-31T05:00:00.000Z')); // Saturday
    await seedFull();
    const body = await forecast();
    expect(body.today).toBe('2026-10-31');
    expect(body.landing.p10).toBe(body.landing.p90);
    expect(body.safeToday).toMatchObject({ weekday: 'Sat' });
  });

  it('works in a 28-day month and only counts bills that still post before its end', async () => {
    const feb = Date.parse('2026-02-26T05:00:00.000Z');
    setNow(feb);
    for (let ago = 1; ago <= 40; ago++) await seedTransaction({ amount: '100', transaction_at: at(ago, feb) });
    await seedItem({ name: 'Gym', amount: 50000, next_due_date: '2026-02-28', day_of_month: 28 });
    await seedItem({ name: 'Cloud', amount: 30000, next_due_date: '2026-03-01', day_of_month: 1 });
    const body = await forecast(`year=2026&month=2&timezone=${encodeURIComponent(IST)}`);
    expect(body).toMatchObject({ month: 2, today: '2026-02-26', mode: 'full' });
    expect(body.landing.billsStillDue).toBe('500.00');
    // Two days left (27, 28) plus the rest of the 26th.
    expect(num(body.landing.flexibleRemaining)).toBeLessThanOrEqual(3 * 1100);
  });

  it('only reads the signed-in user\'s data', async () => {
    setNow(NOW);
    await seedUser(OTHER);
    await seedTransaction({ user_id: OTHER, amount: '99999', transaction_at: at(1) });
    await seedBudget({ user_id: OTHER, monthly: '1' });
    const body = await forecast();
    expect(body.landing).toMatchObject({ spentSoFar: '0.00', budget: null });
  });

  it('leaves out what the user dismissed', async () => {
    setNow(NOW);
    const { croma } = await seedFull();
    const feedback = (kind: string, id: string) =>
      testDb()
        .prepare("INSERT INTO prediction_feedback (id, user_id, target_kind, target_id, verdict, created_at) VALUES (?, ?, ?, ?, 'dismiss', ?)")
        .bind(uid(), USER_ID, kind, id, at(0))
        .run();
    const before = await forecast();
    expect(before.upcoming.some((u) => u.kind === 'likely')).toBe(true);
    expect(before.watch.some((w) => w.kind === 'unusual')).toBe(true);
    await feedback('payee', 'swiggy');
    await feedback('unusual_txn', croma);
    const after = await forecast();
    expect(after.upcoming.some((u) => u.kind === 'likely')).toBe(false);
    expect(after.watch.some((w) => w.kind === 'unusual')).toBe(false);
  });

  it('suggests an untracked subscription', async () => {
    setNow(NOW);
    for (const day of ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05']) {
      await seedTransaction({ amount: '119', counterparty_name: 'Spotify', transaction_at: `${day}T04:00:00.000Z` });
    }
    const body = await forecast();
    expect(body.watch).toEqual([
      { id: 'sub:spotify', kind: 'subscription_candidate', text: 'Spotify, ₹119 monthly. Track it as recurring?', payeeKey: 'spotify', name: 'Spotify', cadence: 'monthly', amount: '119.00', dayOfMonth: 5 },
    ]);
  });
});

describe('safe to spend today', () => {
  it('drops by what was spent today, one for one', async () => {
    setNow(NOW);
    await seedFull();
    await seedBudget({ monthly: '30000' });
    await seedTransaction({ amount: '300', counterparty_name: 'Chai', transaction_at: at(1) }); // yesterday: not part of today
    const before = (await forecast()).safeToday;
    await seedTransaction({ amount: '1000', counterparty_name: 'Dinner', transaction_at: at(0) });
    const after = (await forecast()).safeToday;
    expect(num(before!.amount) - num(after!.amount)).toBe(1000);
  });
});

describe('GET /api/v1/forecast: a past month', () => {
  it('reports what was actually spent, with no range, safe amount, coming up or watch', async () => {
    setNow(NOW);
    await seedFull();
    await seedBudget({ monthly: '10000' });
    const body = await forecast(`year=2026&month=9&timezone=${encodeURIComponent(IST)}`);
    // September: eight Swiggy orders (1600) and six Croma purchases (6000).
    expect(body.landing).toEqual({
      p10: '7600.00',
      p50: '7600.00',
      p90: '7600.00',
      budget: '10000.00',
      chanceUnder: 1,
      spentSoFar: '7600.00',
      billsStillDue: '0.00',
      flexibleRemaining: '0.00',
    });
    expect(body).toMatchObject({ month: 9, today: '2026-10-22', mode: 'full', safeToday: null, upcoming: [], watch: [], accuracy: null });
    expect(body.summary).toBe('You spent ₹7,600 in September, within the ₹10k budget.');
    expect(body.categories.find((c) => c.name === 'Food')).toMatchObject({ spent: '1600.00', p50: '1600.00', status: 'ok' });
  });

  it('needs no profile: it neither builds one nor stores the timezone, and derives the history', async () => {
    setNow(NOW);
    await seedFull();
    const body = await forecast(`year=2026&month=9&timezone=Asia%2FTokyo`);
    expect(await patternsRow()).toBeNull();
    expect(body).toMatchObject({ mode: 'full', historyDays: 82, timezone: 'Asia/Tokyo' });
  });

  it('takes mode and history from the stored profile when there is one', async () => {
    setNow(NOW);
    await seedFull();
    await forecast();
    await seedTransaction({ amount: '1', transaction_at: at(200) }); // older than the stored profile knows
    const body = await forecast(`year=2026&month=9&timezone=${encodeURIComponent(IST)}`);
    expect(body.historyDays).toBe((await profileOf()).historyDays);
  });

  it('is over the budget when the actual passed it', async () => {
    setNow(NOW);
    await seedFull();
    await seedBudget({ monthly: '5000' });
    const body = await forecast(`year=2026&month=9&timezone=${encodeURIComponent(IST)}`);
    expect(body.landing.chanceUnder).toBe(0);
    expect(body.summary).toContain('over the ₹5,000 budget');
  });

  it('works for a month with no transactions', async () => {
    setNow(NOW);
    await seedFull();
    const body = await forecast(`year=2026&month=1&timezone=${encodeURIComponent(IST)}`);
    expect(body.landing).toMatchObject({ p50: '0.00', spentSoFar: '0.00' });
    expect(body.categories).toEqual([]);
  });
});

describe('GET /api/v1/forecast: the engine profile', () => {
  it('builds it on the first request and remembers the requested timezone', async () => {
    setNow(NOW);
    await seedFull();
    expect(await patternsRow()).toBeNull();
    await forecast();
    expect(await patternsRow()).toMatchObject({ version: 1, dirty: 0, timezone: IST, computed_at: new Date(NOW).toISOString() });
    expect((await profileOf()).timezone).toBe(IST);
  });

  it('rebuilds for another timezone and keeps it for the nightly job, once the stored one is over 6 hours old', async () => {
    setNow(NOW);
    await seedFull();
    await forecast();
    expect(await patternsRow()).toMatchObject({ timezone: IST, timezone_at: new Date(NOW).toISOString() });
    await testDb().prepare('UPDATE engine_patterns SET timezone_at = ?').bind(new Date(NOW - 7 * 3_600_000).toISOString()).run();
    const tokyo = await forecast('year=2026&month=10&timezone=Asia%2FTokyo');
    expect(tokyo.timezone).toBe('Asia/Tokyo');
    expect(await patternsRow()).toMatchObject({ timezone: 'Asia/Tokyo', timezone_at: new Date(NOW).toISOString() });
    expect((await profileOf()).timezone).toBe('Asia/Tokyo');
  });

  it('does not rebuild on every request when the app alternates between timezones', async () => {
    setNow(NOW);
    await seedFull();
    await forecast();
    const rebuilt = new Date(NOW).toISOString();
    const zones = ['Asia/Tokyo', IST, 'Asia/Tokyo', 'Europe/London', IST];
    for (const zone of zones) {
      const body = await forecast(`year=2026&month=10&timezone=${encodeURIComponent(zone)}`);
      expect(body.timezone).toBe(zone); // the response still follows the request
    }
    expect(await patternsRow()).toMatchObject({ timezone: IST, computed_at: rebuilt, timezone_at: rebuilt });
    expect((await profileOf()).timezone).toBe(IST);

    // Past the hold, the new one is adopted once.
    vi.setSystemTime(NOW + 7 * 3_600_000);
    await forecast('year=2026&month=10&timezone=Asia%2FTokyo');
    expect(await patternsRow()).toMatchObject({ timezone: 'Asia/Tokyo', computed_at: new Date(NOW + 7 * 3_600_000).toISOString() });
  });

  it('does not rebuild a dirty profile younger than 15 minutes, and does once it is older', async () => {
    setNow(NOW);
    await seedFull();
    await runEngineForUser(makeEnv(), USER_ID, NOW - 5 * MINUTE);
    await markEngineDirty(testDb(), USER_ID);
    await forecast();
    expect(await patternsRow()).toMatchObject({ dirty: 1, computed_at: new Date(NOW - 5 * MINUTE).toISOString() });

    await testDb().prepare('UPDATE engine_patterns SET computed_at = ?').bind(new Date(NOW - 20 * MINUTE).toISOString()).run();
    await forecast();
    expect(await patternsRow()).toMatchObject({ dirty: 0, computed_at: new Date(NOW).toISOString() });
  });

  it('does not rebuild a clean profile', async () => {
    setNow(NOW);
    await seedFull();
    await runEngineForUser(makeEnv(), USER_ID, NOW - 3 * DAY);
    await testDb().prepare('UPDATE engine_patterns SET timezone = ?').bind(IST).run();
    await forecast();
    expect(await patternsRow()).toMatchObject({ dirty: 0, computed_at: new Date(NOW - 3 * DAY).toISOString() });
  });

  it('always reflects the latest transaction, and rebuilds a stale dirty profile', async () => {
    setNow(NOW);
    await seedFull();
    await forecast();
    await seedTransaction({ amount: '700', counterparty_name: 'Dominos', transaction_at: at(0) });
    await markEngineDirty(testDb(), USER_ID);
    await testDb().prepare('UPDATE engine_patterns SET computed_at = ?').bind(new Date(NOW - 20 * MINUTE).toISOString()).run();
    const body = await forecast();
    expect(body.landing.spentSoFar).toBe('5700.00');
    expect(await patternsRow()).toMatchObject({ dirty: 0 });
  });

  it('falls back to the last good profile when the rebuild fails, and fails when there is none', async () => {
    setNow(NOW);
    await seedFull();
    await forecast();
    await markEngineDirty(testDb(), USER_ID);
    await testDb().prepare('UPDATE engine_patterns SET computed_at = ?').bind(new Date(NOW - 20 * MINUTE).toISOString()).run();
    const failing = makeEnv({ DB: failingOn(/SELECT payee_key, count_120d/) });
    const res = await get(undefined, { env: failing });
    expect(res.status).toBe(200);
    expect(await patternsRow()).toMatchObject({ dirty: 1, computed_at: new Date(NOW - 20 * MINUTE).toISOString() });

    await testDb().prepare('DELETE FROM engine_patterns').run();
    expect((await get(undefined, { env: failing })).status).toBe(500);
  });

  it('still answers when the timezone cannot be saved', async () => {
    setNow(NOW);
    await seedFull();
    await forecast();
    await testDb().prepare('UPDATE engine_patterns SET timezone_at = ?').bind(new Date(NOW - 7 * 3_600_000).toISOString()).run();
    const res = await get('year=2026&month=10&timezone=Asia%2FTokyo', { env: makeEnv({ DB: failingOn(/ON CONFLICT \(user_id\) DO UPDATE SET timezone/) }) });
    expect(res.status).toBe(200);
    expect(await patternsRow()).toMatchObject({ timezone: IST });
  });
});
