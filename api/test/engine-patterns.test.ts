import { describe, expect, it } from 'vitest';

import { detectCadences } from '../src/features/engine/cadence';
import { DAY_MS, cv, dayNumber, mad, median, mode, weekdayOf } from '../src/features/engine/math';
import { buildProfile, categoryRestOfMonth, isFlexibleSpend, modeForHistory } from '../src/features/engine/patterns';
import type { EngineTxRow } from '../src/features/engine/types';
import { UNCATEGORIZED_KEY } from '../src/features/transactions/aggregates';

const TZ = 'UTC';
/** Thursday 2026-10-22, 03:00 UTC: the nightly run. */
const NOW = Date.UTC(2026, 9, 22, 3, 0, 0);
const TODAY_N = dayNumber(TZ, NOW);
/** 10:00 UTC on the day `offset` days from today. */
const at = (offset: number) => new Date((TODAY_N + offset) * DAY_MS + 10 * 3_600_000).toISOString();
const rupees = (n: number) => n * 100;

let seq = 0;
function tx(offset: number | string, amount: number, over: Partial<EngineTxRow> = {}): EngineTxRow {
  return {
    id: `t${++seq}`,
    amount: rupees(amount),
    type: 'debit',
    transaction_at: typeof offset === 'number' ? at(offset) : offset,
    category_id: null,
    payee_key: 'swiggy',
    counterparty_name: 'Swiggy',
    counterparty_type: 'merchant',
    recurring_item_id: null,
    scope: 'spend',
    one_off: 0,
    ...over,
  };
}

const profileOf = (rows: EngineTxRow[], over: Partial<Parameters<typeof buildProfile>[0]> = {}) =>
  buildProfile({ rows, firstTransactionAt: at(-14), incomeItems: [], cadences: [], tz: TZ, nowMs: NOW, ...over });

describe('math helpers', () => {
  it('median, MAD, CV and mode', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(mad([100, 300, 200])).toBe(100);
    expect(cv([5, 5, 5])).toBe(0);
    expect(cv([0, 0])).toBe(0);
    expect(cv([2, 4])).toBeCloseTo(1 / 3);
    expect(mode([3, 1, 1, 3])).toBe(1);
    expect(mode([])).toBeNull();
  });

  it('weekdayOf matches the calendar', () => {
    expect(weekdayOf(TODAY_N)).toBe(4); // Thursday
    expect(weekdayOf(TODAY_N + 3)).toBe(0); // Sunday
  });
});

describe('isFlexibleSpend', () => {
  it('keeps plain debits and drops bills, self transfers, fixed categories, one-offs and credits', () => {
    expect(isFlexibleSpend(tx(-1, 10))).toBe(true);
    expect(isFlexibleSpend(tx(-1, 10, { counterparty_type: null }))).toBe(true);
    expect(isFlexibleSpend(tx(-1, 10, { recurring_item_id: 'r1' }))).toBe(false);
    expect(isFlexibleSpend(tx(-1, 10, { counterparty_type: 'self_transfer' }))).toBe(false);
    expect(isFlexibleSpend(tx(-1, 10, { scope: 'recurring_expense' }))).toBe(false);
    expect(isFlexibleSpend(tx(-1, 10, { one_off: 1 }))).toBe(false);
    expect(isFlexibleSpend(tx(-1, 10, { type: 'credit' }))).toBe(false);
  });
});

describe('buildProfile weekday baselines', () => {
  it('lists daily totals per weekday oldest first, zero days included', () => {
    // 14 complete days of history: two samples per weekday. -1 and -8 are the same weekday (Wednesday).
    const p = profileOf([tx(-1, 500), tx(-1, 100), tx(-8, 300)]);
    const wed = weekdayOf(TODAY_N - 1);
    expect(p.weekday).toHaveLength(7);
    expect(p.weekday[wed]).toEqual({ values: [rupees(300), rupees(600)], median: rupees(450) });
    for (const [i, w] of p.weekday.entries()) if (i !== wed) expect(w).toEqual({ values: [0, 0], median: 0 });
    expect(p.overallDailyMedian).toBe(0);
    expect(p.historyDays).toBe(14);
    expect(p.mode).toBe('warming');
    expect(p.version).toBe(1);
    expect(p.widthFactor).toBe(1);
  });

  it('leaves out today (still in progress) and anything after it', () => {
    const p = profileOf([tx(0, 999), tx(1, 999), tx(-1, 10)]);
    expect(p.weekday.flatMap((w) => w.values).reduce((a, b) => a + b, 0)).toBe(rupees(10));
  });

  it('does not count days before the first transaction as zero days', () => {
    const p = profileOf([tx(-5, 10)], { firstTransactionAt: at(-5) });
    expect(p.historyDays).toBe(5);
    expect(p.mode).toBe('learning');
    expect(p.weekday.flatMap((w) => w.values)).toHaveLength(5);
  });

  it('caps the window at windowDays', () => {
    const p = profileOf([], { firstTransactionAt: at(-200), windowDays: 60 });
    expect(p.weekday.flatMap((w) => w.values)).toHaveLength(60);
    expect(p.windowDays).toBe(60);
    expect(p.mode).toBe('full');
  });

  it('counts only flexible spend', () => {
    const p = profileOf([
      tx(-1, 100),
      tx(-1, 5000, { counterparty_type: 'self_transfer' }),
      tx(-1, 5000, { recurring_item_id: 'r1' }),
      tx(-1, 5000, { scope: 'recurring_expense' }),
      tx(-1, 5000, { one_off: 1 }),
      tx(-1, 5000, { type: 'credit' }),
    ]);
    expect(p.weekday[weekdayOf(TODAY_N - 1)]?.values).toEqual([0, rupees(100)]);
  });

  it('is empty (not NaN) for a user with no history', () => {
    const p = profileOf([], { firstTransactionAt: null });
    expect(p.historyDays).toBe(0);
    expect(p.mode).toBe('learning');
    expect(p.overallDailyMedian).toBe(0);
    expect(p.weekday.every((w) => w.values.length === 0 && w.median === 0)).toBe(true);
    expect(p.categories).toEqual({});
  });

  it('modeForHistory thresholds', () => {
    expect([0, 13, 14, 29, 30, 90].map(modeForHistory)).toEqual(['learning', 'learning', 'warming', 'warming', 'full', 'full']);
  });
});

describe('buildProfile category baselines', () => {
  const first = '2026-06-01T00:00:00.000Z';
  const rows = [
    tx('2026-07-10T10:00:00.000Z', 100, { category_id: 'food' }),
    tx('2026-08-03T10:00:00.000Z', 100, { category_id: 'food' }),
    tx('2026-08-20T10:00:00.000Z', 200, { category_id: 'food' }),
    tx('2026-09-30T10:00:00.000Z', 200, { category_id: 'food' }),
    tx('2026-08-15T10:00:00.000Z', 50, { category_id: 'fun' }),
    tx('2026-09-02T10:00:00.000Z', 30), // uncategorized
    tx('2026-10-05T10:00:00.000Z', 700, { category_id: 'food' }), // the current month is incomplete
    tx('2026-09-05T10:00:00.000Z', 900, { category_id: 'food', scope: 'recurring_expense' }),
  ];

  it('totals complete past months per category with median and MAD', () => {
    const p = profileOf(rows, { firstTransactionAt: first });
    expect(p.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(p.categories['food']).toEqual({ monthlyTotals: [rupees(100), rupees(300), rupees(200)], median: rupees(200), mad: rupees(100) });
    expect(p.categories['fun']).toEqual({ monthlyTotals: [0, rupees(50), 0], median: 0, mad: 0 });
    expect(p.categories[UNCATEGORIZED_KEY]?.monthlyTotals).toEqual([0, 0, rupees(30)]);
  });

  it('keys categories by lower-case id, whatever case the rows carry', () => {
    const p = profileOf([tx('2026-08-03T10:00:00.000Z', 100, { category_id: 'A1B2' }), tx('2026-09-03T10:00:00.000Z', 100, { category_id: 'a1b2' })], { firstTransactionAt: first });
    expect(Object.keys(p.categories)).toEqual(['a1b2']);
    expect(p.categories['a1b2']?.monthlyTotals).toEqual([0, rupees(100), rupees(100)]);
  });

  it('skips months that start before the first transaction or before the lookback', () => {
    const p = profileOf(rows, { firstTransactionAt: '2026-08-15T00:00:00.000Z' });
    expect(p.months).toEqual(['2026-09']);
    expect(p.categories['food']?.monthlyTotals).toEqual([rupees(200)]);
  });
});

describe('categoryRestOfMonth', () => {
  const months = ['2026-07', '2026-08', '2026-09'];
  // A monthly bill paid on the 10th; a daily category with a purchase on the 25th and 31st / 30th.
  const rows = [
    ...months.map((m) => tx(`${m}-10T10:00:00.000Z`, 1700, { category_id: 'bills' })),
    tx('2026-07-25T10:00:00.000Z', 300, { category_id: 'food' }),
    tx('2026-07-31T10:00:00.000Z', 100, { category_id: 'food' }),
    tx('2026-08-25T10:00:00.000Z', 200, { category_id: 'food' }),
    tx('2026-09-30T10:00:00.000Z', 100, { category_id: 'food' }),
  ];

  it('takes the median over months of the spend after the current day of month', () => {
    const rest = categoryRestOfMonth(rows, TZ, months, 22);
    expect(rest.get('bills')).toBe(0); // paid on the 10th every month: nothing more expected
    expect(rest.get('food')).toBe(rupees(200)); // [400, 200, 100] -> 200
  });

  it('clamps the day to a short month and leaves out the days up to and including it', () => {
    expect(categoryRestOfMonth(rows, TZ, months, 31).get('food')).toBe(0);
    expect(categoryRestOfMonth(rows, TZ, months, 25).get('food')).toBe(rupees(100)); // [100, 0, 100]
    // 30 Sep is the last day of September: with today the 31st nothing comes after it.
    expect(categoryRestOfMonth(rows, TZ, months, 30).get('food')).toBe(0);
  });

  it('is empty with fewer than 2 complete months, and ignores bills, one-offs and non-listed months', () => {
    expect(categoryRestOfMonth(rows, TZ, ['2026-09'], 22).size).toBe(0);
    const noisy = [...rows, tx('2026-08-28T10:00:00.000Z', 5000, { category_id: 'bills', recurring_item_id: 'r' }), tx('2026-10-28T10:00:00.000Z', 5000, { category_id: 'bills' })];
    expect(categoryRestOfMonth(noisy, TZ, months, 22).get('bills')).toBe(0);
  });
});

describe('payday', () => {
  it('prefers the largest active recurring income item', () => {
    const p = profileOf([], { incomeItems: [{ amount: 1000, day_of_month: 25 }, { amount: 5000, day_of_month: 1 }] });
    expect(p.payday).toBe(1);
  });

  it('falls back to the largest monthly credit cadence, and is null without either', () => {
    const credits = [tx('2026-08-01T09:00:00.000Z', 80000), tx('2026-09-01T09:00:00.000Z', 80000), tx('2026-10-01T09:00:00.000Z', 80000)].map((r) => ({
      ...r,
      type: 'credit' as const,
      payee_key: 'acme',
    }));
    const cadences = detectCadences(credits, TZ);
    expect(profileOf([], { cadences }).payday).toBe(1);
    expect(profileOf([]).payday).toBeNull();
  });
});

describe('detectCadences', () => {
  const kindsOf = (rows: EngineTxRow[]) => Object.fromEntries(detectCadences(rows, TZ).map((d) => [d.payeeKey, d.kind]));

  it('finds a habit: a payee every ~4 days', () => {
    const rows = [-20, -16, -12, -8, -4].map((o, i) => tx(o, 150 + i * 40, { payee_key: 'chai', counterparty_name: 'Chai Point', category_id: 'food' }));
    const [d] = detectCadences(rows, TZ);
    expect(d).toMatchObject({ payeeKey: 'chai', displayName: 'Chai Point', kind: 'habit', count: 5, medianIntervalDays: 4, intervalCv: 0, categoryId: 'food', alpha: 2, beta: 1 });
    expect(d?.lastAt).toBe(at(-4));
    expect(d?.nextExpectedAt).toBe(new Date(Date.parse(at(-4)) + 4 * DAY_MS).toISOString());
    expect(d?.medianAmount).toBe(rupees(230));
  });

  it('finds a monthly subscription: same amount about every 30 days', () => {
    const rows = ['2026-08-05', '2026-09-05', '2026-10-05'].map((d) => tx(`${d}T10:00:00.000Z`, 649, { payee_key: 'netflix', counterparty_name: 'Netflix' }));
    const [d] = detectCadences(rows, TZ);
    expect(d).toMatchObject({ kind: 'subscription', count: 3, medianIntervalDays: 30.5, medianAmount: rupees(649), alpha: 2 });
    expect(d?.nextExpectedAt).toBe('2026-11-04T22:00:00.000Z'); // 2026-10-05 10:00 + 30.5 days
  });

  it('a monthly payee with a varying amount is a habit, not a subscription', () => {
    const rows = [
      tx('2026-08-05T10:00:00.000Z', 400, { payee_key: 'power' }),
      tx('2026-09-05T10:00:00.000Z', 900, { payee_key: 'power' }),
      tx('2026-10-05T10:00:00.000Z', 600, { payee_key: 'power' }),
    ];
    expect(kindsOf(rows)).toEqual({ power: 'habit' });
  });

  it('a monthly-looking payee with an uneven rhythm is a habit, not a subscription', () => {
    // Intervals 10, 29, 30, 31, 70 days: median 30, but nothing like a steady monthly charge.
    const rows = [-175, -165, -136, -106, -75, -5].map((o) => tx(o, 299, { payee_key: 'gym' }));
    const [d] = detectCadences(rows, TZ);
    expect(d).toMatchObject({ kind: 'habit', medianIntervalDays: 30 });
    expect(d?.intervalCv).toBeGreaterThan(0.3);
    expect(d?.alpha).toBe(1);
  });

  it('an irregular payee is unknown with no expected date and the weak prior', () => {
    const rows = [-80, -79, -59, -56, -16].map((o) => tx(o, 100, { payee_key: 'mall' }));
    const [d] = detectCadences(rows, TZ);
    expect(d).toMatchObject({ kind: 'unknown', nextExpectedAt: null, alpha: 1, beta: 1 });
    expect(d?.intervalCv).toBeGreaterThan(0.6);
  });

  it('credits are income, with the common day of month', () => {
    const rows = ['2026-08-01', '2026-09-01', '2026-10-02'].map((d) => tx(`${d}T09:00:00.000Z`, 80000, { type: 'credit', payee_key: 'acme', counterparty_name: 'Acme' }));
    const [d] = detectCadences(rows, TZ);
    expect(d).toMatchObject({ kind: 'income', commonDay: 1, medianAmount: rupees(80000) });
    expect(d?.nextExpectedAt).not.toBeNull();
  });

  it('needs three days: same-day repeats collapse, self transfers and rare payees are ignored', () => {
    const rows = [
      tx(-1, 10, { payee_key: 'a' }),
      tx(-1, 10, { payee_key: 'a' }),
      tx(-5, 10, { payee_key: 'a' }),
      ...[-30, -20, -10].map((o) => tx(o, 10, { payee_key: 'me', counterparty_type: 'self_transfer' })),
    ];
    expect(detectCadences(rows, TZ)).toEqual([]);
    expect(detectCadences([...rows, tx(-9, 10, { payee_key: 'a' })], TZ).map((d) => [d.payeeKey, d.count])).toEqual([['a', 3]]);
  });

  it('a payee both paid and received keeps its more frequent side', () => {
    const debits = [-30, -20, -10].map((o) => tx(o, 100, { payee_key: 'raj' }));
    const credits = [-40, -30, -20, -10, -5].map((o) => tx(o, 100, { payee_key: 'raj', type: 'credit' }));
    const result = detectCadences([...debits, ...credits], TZ);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ payeeKey: 'raj', kind: 'income', count: 5 });
  });
});
