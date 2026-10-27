import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportListResponse, ReportSnapshot } from '../src/features/reports/schemas';
import { buildReport } from '../src/features/reports/service';
import { call } from './helpers';
import { USER_ID, oneRow, rowsOf, seedCategory, seedTransaction, seedUser, testDb } from './db';

// "Now" is 5 November 2026 in Kolkata, so October is the newest finished month.
const NOW = new Date('2026-11-05T10:00:00.000Z');
const OTHER = '99999999-9999-9999-9999-999999999999';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

/** `n` debits of Rs 100 * (1..n) in the given month ('2026-10'), one per day from the 2nd. */
async function seedDebits(month: string, n: number, over: Parameters<typeof seedTransaction>[0] = {}) {
  for (let i = 1; i <= n; i += 1) {
    await seedTransaction({
      amount: String(i * 100),
      counterparty_name: `Shop ${i}`,
      transaction_at: `${month}-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      ...over,
    });
  }
}

/** What the cron consumer does for one user: build and store the month's snapshot. */
const build = (period: string, userId = USER_ID) => buildReport(testDb(), userId, period, Date.now());

const get = (period: string) => call(`/api/v1/reports/${period}`);
const post = (period: string) => call(`/api/v1/reports/${period}/viewed`, { method: 'POST' });
const list = async () => (await call('/api/v1/reports')).json<ReportListResponse>();
const stored = () => rowsOf<{ user_id: string; period_key: string; version: number; snapshot: string; viewed_at: string | null }>('monthly_reports');

describe('auth', () => {
  it.each([
    ['GET', '/api/v1/reports'],
    ['GET', '/api/v1/reports/2026-10'],
    ['POST', '/api/v1/reports/2026-10/viewed'],
  ])('%s %s needs a token', async (method, path) => {
    expect((await call(path, { method, token: false })).status).toBe(401);
  });
});

describe('GET /reports/:period (reads what the cron stored; never builds)', () => {
  it('404 while nothing is stored, even for a month that has plenty of debits', async () => {
    await seedDebits('2026-10', 8);
    const res = await get('2026-10');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Report not found.' });
    expect(await stored()).toHaveLength(0); // nothing was built or written
  });

  it('serves the stored snapshot, exactly as built, and stays immutable when the data changes', async () => {
    await seedDebits('2026-10', 6);
    await seedTransaction({ amount: '5000', type: 'credit', counterparty_name: 'Boss', transaction_at: '2026-10-01T10:00:00.000Z' });
    expect(await build('2026-10')).toBe('built');

    const res = await get('2026-10');
    expect(res.status).toBe(200);
    const first = await res.json<ReportSnapshot>();
    expect(first).toMatchObject({
      version: 1,
      period_key: '2026-10',
      year: 2026,
      month: 10,
      timezone: 'Asia/Kolkata',
      generated_at: NOW.toISOString(),
      debit_count: 6,
      spent: '2100.00', // 100 + 200 + ... + 600
      income: '5000.00',
      usual_spent: null,
      vs_usual: null,
    });
    expect(first.biggest_spend).toMatchObject({ amount: '600.00', display_name: 'Shop 6', category_name: 'Uncategorized' });
    expect(first.slides).toEqual(expect.arrayContaining(['cover', 'damage', 'lineup', 'moment', 'closing']));
    expect(JSON.parse((await stored())[0]?.snapshot ?? '{}')).toEqual(first);

    vi.setSystemTime(new Date('2026-11-20T10:00:00.000Z'));
    await seedTransaction({ amount: '999', transaction_at: '2026-10-20T10:00:00.000Z' });
    expect(await build('2026-10')).toBe('exists');
    expect(await (await get('2026-10')).json()).toEqual(first);
    expect(await stored()).toHaveLength(1);
  });

  it('an older stored version is still served as is (only a cron re-run replaces it)', async () => {
    await seedDebits('2026-10', 5);
    await build('2026-10');
    await testDb().prepare("UPDATE monthly_reports SET version = 0, snapshot = '{\"old\":true}'").run();
    expect(await (await get('2026-10')).json()).toEqual({ old: true });
    expect((await stored())[0]?.version).toBe(0);
  });

  it('404 for the current and a future month', async () => {
    await seedDebits('2026-11', 8);
    await seedDebits('2026-12', 8);
    for (const period of ['2026-11', '2026-12']) expect((await get(period)).status, period).toBe(404);
    expect(await stored()).toHaveLength(0);
  });

  it('only the caller\'s own report is visible', async () => {
    await seedUser(OTHER);
    await seedDebits('2026-10', 5, { user_id: OTHER });
    await build('2026-10', OTHER);
    expect(await stored()).toHaveLength(1);
    expect((await get('2026-10')).status).toBe(404);
  });

  it.each(['2026-13', '2026-00', '2026-1', '1999-05', 'abc', '2026-10-01'])('422 for the malformed period %s', async (period) => {
    const res = await get(period);
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ detail: [{ loc: ['path', 'period'] }] });
  });
});

describe('buildReport (the cron consumer\'s step)', () => {
  it('counts only this user\'s live debits, with the month cut at IST midnight', async () => {
    await seedDebits('2026-10', 5);
    // 2026-09-30T19:00Z is 00:30 on October 1st in Kolkata (October); 2026-10-31T18:30Z is already November 1st (November).
    await seedTransaction({ amount: '1000', counterparty_name: 'Midnight', transaction_at: '2026-09-30T19:00:00.000Z' });
    await seedTransaction({ amount: '7777', counterparty_name: 'Next month', transaction_at: '2026-10-31T18:30:00.000Z' });
    await seedTransaction({ amount: '7777', deleted_at: '2026-10-09T00:00:00.000Z', transaction_at: '2026-10-09T10:00:00.000Z' });
    await seedUser(OTHER);
    await seedTransaction({ user_id: OTHER, amount: '7777', transaction_at: '2026-10-09T10:00:00.000Z' });

    expect(await build('2026-10')).toBe('built');
    const october = await (await get('2026-10')).json<ReportSnapshot>();
    expect(october.debit_count).toBe(6);
    expect(october.spent).toBe('2500.00'); // 100..500 plus 1,000
    expect(october.busiest_day).toEqual({ date: '2026-10-01', amount: '1000.00', count: 1 });
    expect(october.first_week_share).toBeGreaterThan(0.5);

    // Nothing of it is in September: no report there.
    expect(await build('2026-09')).toBe('ineligible');
  });

  it('uses the earlier months for the usual spend', async () => {
    await seedDebits('2026-09', 5); // 1,500
    await seedDebits('2026-10', 6); // 2,100
    await build('2026-10');
    const snap = await (await get('2026-10')).json<ReportSnapshot>();
    expect(snap).toMatchObject({ usual_spent: '1500.00', vs_usual: 'up', vs_usual_delta: '600.00' });
  });

  it('names categories and ranks them', async () => {
    const food = await seedCategory({ name: 'Groceries', icon_name: 'Apple', color: '#00FF00' });
    await seedDebits('2026-10', 5, { category_id: food });
    await build('2026-10');
    const snap = await (await get('2026-10')).json<ReportSnapshot>();
    expect(snap.categories).toEqual([{ id: food, name: 'Groceries', icon_name: 'Apple', color: '#00FF00', amount: '1500.00', share: 1, count: 5 }]);
  });

  it('ineligible: the current and a future month, fewer than 5 debits (deleted ones do not count), an empty month', async () => {
    await seedDebits('2026-11', 8);
    await seedDebits('2026-12', 8);
    await seedDebits('2026-08', 4);
    await seedDebits('2026-10', 4);
    await seedTransaction({ transaction_at: '2026-10-20T10:00:00.000Z', deleted_at: '2026-10-21T00:00:00.000Z' });
    for (const period of ['2026-11', '2026-12', '2026-08', '2026-07', '2026-10', 'junk']) expect(await build(period), period).toBe('ineligible');
    expect(await stored()).toHaveLength(0);
  });

  it('two builds at once store one snapshot', async () => {
    await seedDebits('2026-10', 5);
    const results = await Promise.all([build('2026-10'), build('2026-10')]);
    expect(results).toContain('built');
    expect(await stored()).toHaveLength(1);
  });

  it('rebuilds a stored snapshot of an older version in place and keeps viewed_at', async () => {
    await seedDebits('2026-10', 5);
    await build('2026-10');
    await post('2026-10');
    const viewedAt = (await stored())[0]?.viewed_at;
    await testDb().prepare("UPDATE monthly_reports SET version = 0, snapshot = '{\"old\":true}'").run();

    expect(await build('2026-10')).toBe('built');
    const rows = await stored();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 1, viewed_at: viewedAt });
    expect(await (await get('2026-10')).json()).toMatchObject({ version: 1, debit_count: 5 });
  });
});

describe('GET /reports', () => {
  it('lists only stored reports of the last 12 months, newest first, and builds nothing', async () => {
    for (const m of ['2026-10', '2026-08', '2026-09', '2025-11', '2025-10']) await seedDebits(m, 5);
    await seedDebits('2026-07', 6); // eligible but never built by the cron: not listed
    for (const m of ['2026-10', '2026-08', '2025-11', '2025-10']) await build(m); // 2025-10 is 13 months back
    await testDb().prepare("INSERT INTO monthly_reports (user_id, period_key, version, snapshot) VALUES (?, '2026-11', 1, '{}')").bind(USER_ID).run(); // the current month never shows

    expect(await list()).toEqual({
      items: [
        { period_key: '2026-10', year: 2026, month: 10, debit_count: 5, viewed: false },
        { period_key: '2026-08', year: 2026, month: 8, debit_count: 5, viewed: false },
        { period_key: '2025-11', year: 2025, month: 11, debit_count: 5, viewed: false },
      ],
    });
    expect(await stored()).toHaveLength(5);
  });

  it('reports viewed once opened', async () => {
    await seedDebits('2026-10', 5);
    await seedDebits('2026-08', 7);
    await build('2026-10');
    await build('2026-08');
    expect((await list()).items).toMatchObject([
      { period_key: '2026-10', viewed: false },
      { period_key: '2026-08', debit_count: 7, viewed: false },
    ]);
    await post('2026-10');
    expect((await list()).items).toMatchObject([{ period_key: '2026-10', viewed: true }, { period_key: '2026-08', viewed: false }]);
  });

  it('is empty without stored reports and ignores other users', async () => {
    await seedDebits('2026-10', 5);
    expect(await list()).toEqual({ items: [] });
    await seedUser(OTHER);
    await seedDebits('2026-10', 5, { user_id: OTHER });
    await build('2026-10', OTHER);
    expect(await list()).toEqual({ items: [] });
  });
});

describe('POST /reports/:period/viewed', () => {
  it('404 until the cron has stored the report (viewing never builds it)', async () => {
    await seedDebits('2026-10', 5);
    expect((await post('2026-10')).status).toBe(404);
    expect(await stored()).toHaveLength(0);
  });

  it('sets viewed_at once; repeating it is a no-op that keeps the first time', async () => {
    await seedDebits('2026-10', 5);
    await build('2026-10');

    const res = await post('2026-10');
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    const first = (await oneRow<{ viewed_at: string | null }>('monthly_reports', 'period_key = ?', '2026-10'))?.viewed_at;
    expect(first).toBe(NOW.toISOString());

    vi.setSystemTime(new Date('2026-11-06T10:00:00.000Z'));
    expect((await post('2026-10')).status).toBe(204);
    expect((await oneRow<{ viewed_at: string | null }>('monthly_reports', 'period_key = ?', '2026-10'))?.viewed_at).toBe(first);
  });

  it('only touches the caller\'s own report and rejects a malformed period', async () => {
    await seedUser(OTHER);
    await seedDebits('2026-10', 5, { user_id: OTHER });
    await seedDebits('2026-10', 5);
    await build('2026-10');
    await build('2026-10', OTHER);
    await post('2026-10');
    expect((await oneRow<{ viewed_at: string | null }>('monthly_reports', 'user_id = ?', OTHER))?.viewed_at).toBeNull();
    expect((await post('2026-1x')).status).toBe(422);
  });
});
