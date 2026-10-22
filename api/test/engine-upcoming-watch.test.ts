import { describe, expect, it } from 'vitest';

import type { CategoryOutlook } from '../src/features/engine/forecast';
import { DAY_MS, dateN } from '../src/features/engine/math';
import type { EngineTxRow, PayeePatternRow } from '../src/features/engine/types';
import { billsStillDue, buildUpcoming, recurringOccurrences } from '../src/features/engine/upcoming';
import type { UpcomingInput } from '../src/features/engine/upcoming';
import { buildWatch } from '../src/features/engine/watch';
import type { WatchInput } from '../src/features/engine/watch';
import type { RecurringRow } from '../src/features/recurring/schemas';

const TZ = 'UTC';
/** Thursday 2026-10-22. The window runs to Wed 2026-11-04. */
const TODAY = { year: 2026, month: 10, day: 22 };
const TODAY_N = dateN(TODAY);
/** 10:00 UTC on the day `offset` days from today. */
const at = (offset: number) => new Date((TODAY_N + offset) * DAY_MS + 10 * 3_600_000).toISOString();

let seq = 0;
const item = (over: Partial<RecurringRow> = {}): RecurringRow => ({
  id: `r${++seq}`,
  user_id: 'u',
  kind: 'subscription',
  name: 'Netflix',
  amount: 64_900,
  category_id: null,
  cadence: 'monthly',
  day_of_month: 24,
  month_of_year: null,
  timezone: TZ,
  next_due_date: '2026-10-24',
  active: 1,
  note: null,
  created_at: '',
  updated_at: '',
  ...over,
});

const pattern = (over: Partial<PayeePatternRow> = {}): PayeePatternRow => ({
  payee_key: 'swiggy',
  display_name: 'Swiggy',
  kind: 'habit',
  category_id: null,
  count_120d: 10,
  median_amount: 20_000,
  median_interval_days: 4,
  interval_cv: 0.1,
  last_at: at(-3),
  next_expected_at: at(2),
  alpha: 2,
  beta: 1,
  suppressed: 0,
  ...over,
});

const tx = (offset: number, rupees: number, over: Partial<EngineTxRow> = {}): EngineTxRow => ({
  id: `t${++seq}`,
  amount: rupees * 100,
  type: 'debit',
  transaction_at: at(offset),
  category_id: null,
  payee_key: 'swiggy',
  counterparty_name: 'Swiggy',
  counterparty_type: 'merchant',
  recurring_item_id: null,
  scope: 'spend',
  one_off: 0,
  ...over,
});

const upcoming = (over: Partial<UpcomingInput> = {}) =>
  buildUpcoming({ today: TODAY, tz: TZ, recurring: [], patterns: [], rows: [], dismissed: new Set(), learning: false, ...over });

describe('recurringOccurrences and billsStillDue', () => {
  it('lists the next due date and the periods after it that fall in the window', () => {
    const weekly = item({ next_due_date: '2026-10-22', day_of_month: 22 });
    const out = recurringOccurrences([weekly], 'subscription', '2026-10-22', '2026-12-31');
    expect(out.map((o) => o.date)).toEqual(['2026-10-22', '2026-11-22', '2026-12-22']);
  });

  it('counts a due date already passed (not posted yet) as today, and skips paused items and the other kind', () => {
    const overdue = item({ next_due_date: '2026-10-20' });
    const paused = item({ active: 0 });
    const salary = item({ kind: 'income' });
    expect(recurringOccurrences([overdue, paused, salary], 'subscription', '2026-10-22', '2026-10-31').map((o) => [o.item.id, o.date])).toEqual([[overdue.id, '2026-10-22']]);
  });

  it('an item overdue by several periods counts once, today, then its coming periods as usual', () => {
    const behind = item({ amount: 10_000, next_due_date: '2026-07-15', day_of_month: 15 });
    expect(recurringOccurrences([behind], 'subscription', '2026-10-22', '2026-11-30').map((o) => o.date)).toEqual(['2026-10-22', '2026-11-15']);
    // Only one posting's worth is still due this month, not three.
    expect(billsStillDue([behind], '2026-10-22', '2026-10-31').total).toBe(10_000);
    expect(upcoming({ recurring: [behind] }).map((u) => [u.date, u.amount])).toEqual([['2026-10-22', 10_000]]);
  });

  it('adds up what still posts this month, with a yearly bill and per category', () => {
    const food = 'c1';
    const items = [
      item({ amount: 10_000, next_due_date: '2026-10-22', category_id: 'C1' }), // due today
      item({ amount: 20_000, next_due_date: '2026-10-31', category_id: 'c1' }), // the last day
      item({ amount: 500_000, cadence: 'yearly', month_of_year: 10, day_of_month: 30, next_due_date: '2026-10-30' }),
      item({ amount: 40_000, next_due_date: '2026-11-03' }), // next month
      item({ amount: 80_000, next_due_date: '2026-10-25', active: 0 }),
    ];
    const bills = billsStillDue(items, '2026-10-22', '2026-10-31');
    expect(bills.total).toBe(530_000);
    expect(bills.byCategory).toEqual(new Map([[food, 30_000]]));
  });

  it('clamps the 31st in a short month', () => {
    const thirtyFirst = item({ day_of_month: 31, next_due_date: '2026-10-31' });
    expect(recurringOccurrences([thirtyFirst], 'subscription', '2026-10-22', '2026-12-31').map((o) => o.date)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });
});

describe('buildUpcoming', () => {
  it('shows bills and income of the next 14 days, sorted, with stable ids', () => {
    const netflix = item({ name: 'Netflix' });
    const rent = item({ name: 'Rent', amount: 1_500_000, next_due_date: '2026-11-04', day_of_month: 4 });
    const later = item({ name: 'Gym', next_due_date: '2026-11-05', day_of_month: 5 });
    const yearly = item({ name: 'Insurance', amount: 900_000, cadence: 'yearly', month_of_year: 10, day_of_month: 30, next_due_date: '2026-10-30' });
    const salary = item({ kind: 'income', name: 'Salary', amount: 8_000_000, next_due_date: '2026-11-01', day_of_month: 1 });
    const out = upcoming({ recurring: [rent, later, netflix, salary, yearly] });
    expect(out.map((u) => [u.kind, u.name, u.date, u.amount])).toEqual([
      ['bill', 'Netflix', '2026-10-24', 64_900],
      ['bill', 'Insurance', '2026-10-30', 900_000],
      ['income', 'Salary', '2026-11-01', 8_000_000],
      ['bill', 'Rent', '2026-11-04', 1_500_000],
    ]);
    expect(out[0]?.id).toBe(`bill:${netflix.id}:2026-10-24`);
    expect(out[2]?.id).toBe(`income:${salary.id}:2026-11-01`);
  });

  it('orders bill, income, likely spend on the same day', () => {
    const out = upcoming({
      recurring: [item({ next_due_date: '2026-10-24' }), item({ kind: 'income', name: 'Refund', next_due_date: '2026-10-24' })],
      patterns: [pattern({ next_expected_at: at(2) })],
    });
    expect(out.map((u) => u.kind)).toEqual(['bill', 'income', 'likely']);
  });

  describe('likely spends', () => {
    it('shows a confident habit on its expected date with its median amount', () => {
      const [only] = upcoming({ patterns: [pattern()] });
      expect(only).toEqual({ id: 'likely:swiggy', kind: 'likely', name: 'Swiggy', amount: 20_000, date: '2026-10-24', payeeKey: 'swiggy', confidence: 0.67, categoryId: null });
    });

    it('needs confidence of 0.6, and is hidden below 0.4 anyway', () => {
      expect(upcoming({ patterns: [pattern({ alpha: 3, beta: 2 })] })).toHaveLength(1); // 0.6
      expect(upcoming({ patterns: [pattern({ alpha: 1, beta: 1 })] })).toHaveLength(0); // 0.5
      expect(upcoming({ patterns: [pattern({ alpha: 1, beta: 3 })] })).toHaveLength(0); // 0.25
    });

    it('skips suppressed, inactive and dismissed payees and other kinds', () => {
      expect(upcoming({ patterns: [pattern({ suppressed: 1 })] })).toHaveLength(0);
      expect(upcoming({ patterns: [pattern({ count_120d: 0, next_expected_at: null })] })).toHaveLength(0);
      expect(upcoming({ patterns: [pattern()], dismissed: new Set(['payee:swiggy']) })).toHaveLength(0);
      expect(upcoming({ patterns: [pattern({ kind: 'subscription' }), pattern({ kind: 'unknown' })] })).toHaveLength(0);
      expect(upcoming({ patterns: [pattern({ next_expected_at: null })] })).toHaveLength(0);
    });

    it('shows a spend up to two days late as today, and drops it after that', () => {
      expect(upcoming({ patterns: [pattern({ next_expected_at: at(-1) })] })[0]?.date).toBe('2026-10-22');
      expect(upcoming({ patterns: [pattern({ next_expected_at: at(-2) })] })[0]?.date).toBe('2026-10-22');
      expect(upcoming({ patterns: [pattern({ next_expected_at: at(-3) })] })).toHaveLength(0);
    });

    it('drops it when it already happened today, and when it is beyond 14 days', () => {
      const late = pattern({ next_expected_at: at(-1) });
      expect(upcoming({ patterns: [late], rows: [tx(0, 150)] })).toHaveLength(0);
      expect(upcoming({ patterns: [late], rows: [tx(-1, 150)] })).toHaveLength(1);
      expect(upcoming({ patterns: [pattern({ next_expected_at: at(13) })] })).toHaveLength(1); // Nov 4: the last day
      expect(upcoming({ patterns: [pattern({ next_expected_at: at(14) })] })).toHaveLength(0);
    });

    it('has none while the user is still learning, but keeps bills', () => {
      const out = upcoming({ learning: true, patterns: [pattern()], recurring: [item()] });
      expect(out.map((u) => u.kind)).toEqual(['bill']);
    });
  });

  describe('income patterns', () => {
    const acme = pattern({ payee_key: 'acme corp', display_name: 'Acme Corp', kind: 'income', median_amount: 8_000_000, next_expected_at: at(10) }); // Nov 1

    it('shows income that repeats without a recurring item', () => {
      expect(upcoming({ patterns: [acme] })[0]).toMatchObject({ id: 'income:acme corp', kind: 'income', name: 'Acme Corp', amount: 8_000_000, date: '2026-11-01' });
    });

    it('is left out when a recurring income covers the same pay day and amount, or has the same name', () => {
      const salary = item({ kind: 'income', name: 'Salary', amount: 8_000_000, next_due_date: '2026-11-03', day_of_month: 3 });
      expect(upcoming({ patterns: [acme], recurring: [salary] }).map((u) => u.id)).toEqual([`income:${salary.id}:2026-11-03`]);
      const far = item({ kind: 'income', name: 'Other', amount: 8_000_000, next_due_date: '2026-11-04', day_of_month: 4 }); // 3 days away: still the same pay day
      expect(upcoming({ patterns: [acme], recurring: [far] }).map((u) => u.kind)).toEqual(['income']);
      expect(upcoming({ patterns: [acme], recurring: [far] })[0]?.id).toBe(`income:${far.id}:2026-11-04`);
      // A different amount (here 1.5x) or a date more than 3 days away is a different income.
      const bonus = item({ kind: 'income', name: 'Bonus', amount: 12_000_000, next_due_date: '2026-11-02', day_of_month: 2 });
      expect(upcoming({ patterns: [acme], recurring: [bonus] }).map((u) => u.id)).toEqual(['income:acme corp', `income:${bonus.id}:2026-11-02`]);
      const edge = item({ kind: 'income', name: 'Edge', amount: 6_700_000, next_due_date: '2026-11-02', day_of_month: 2 }); // 8000000 is 19.4% above
      expect(upcoming({ patterns: [acme], recurring: [edge] }).map((u) => u.id)).toEqual([`income:${edge.id}:2026-11-02`]);
      const wrongDay = item({ kind: 'income', name: 'Late', amount: 8_000_000, next_due_date: '2026-11-04', day_of_month: 4 });
      const early = { ...acme, next_expected_at: at(8) }; // Oct 30: 5 days before
      expect(upcoming({ patterns: [early], recurring: [wrongDay] }).map((u) => u.kind)).toEqual(['income', 'income']);
      const named = item({ kind: 'income', name: 'acme corp', next_due_date: '2026-12-01', day_of_month: 1 });
      expect(upcoming({ patterns: [acme], recurring: [named] })).toHaveLength(0);
    });

    it('needs only a confidence of 0.4', () => {
      expect(upcoming({ patterns: [{ ...acme, alpha: 1, beta: 1 }] })).toHaveLength(1);
      expect(upcoming({ patterns: [{ ...acme, alpha: 1, beta: 2 }] })).toHaveLength(0);
    });
  });
});

describe('buildWatch', () => {
  const outlook = (over: Partial<CategoryOutlook & { name: string }> = {}): CategoryOutlook & { name: string } => ({
    id: 'food',
    name: 'Food',
    spent: 300_000,
    p50: 620_000,
    budget: null,
    baseline: 450_000,
    status: 'hot',
    ...over,
  });
  const watch = (over: Partial<WatchInput> = {}) =>
    buildWatch({
      tz: TZ,
      today: TODAY,
      mode: 'full',
      categories: [],
      rows: [],
      monthFrom: '2026-10-01T00:00:00.000Z',
      patterns: [],
      recurring: [],
      dismissed: new Set(),
      ...over,
    });

  describe('categories', () => {
    it('flags a hot category with its biggest payee so far', () => {
      const rows = [tx(-2, 1500, { category_id: 'food', payee_key: 'zomato', counterparty_name: 'Zomato' }), tx(-3, 400, { category_id: 'food' }), tx(-1, 9000, { category_id: 'other' })];
      const [item] = watch({ categories: [outlook()], rows });
      expect(item).toMatchObject({
        id: 'hot:food',
        kind: 'category_hot',
        categoryId: 'food',
        amount: 620_000,
        text: 'Food is heading for ₹6,200; you usually spend ₹4,500. Most of it so far is Zomato (₹1,500).',
      });
    });

    it('flags an over-budget category, over before hot, and leaves ok and uncategorized out', () => {
      const out = watch({
        categories: [
          outlook({ id: 'a', name: 'A', status: 'hot', p50: 900_000, baseline: 100_000 }),
          outlook({ id: 'b', name: 'B', status: 'over', p50: 600_000, budget: 500_000 }),
          outlook({ id: 'c', name: 'C', status: 'ok' }),
          outlook({ id: null, name: 'Uncategorized', status: 'hot' }),
        ],
      });
      expect(out.map((w) => w.id)).toEqual(['hot:b', 'hot:a']);
      expect(out[0]?.text).toBe('B is heading for ₹6,000, over its ₹5,000 budget.');
    });

    it('respects a dismissed category watch', () => {
      expect(watch({ categories: [outlook()], dismissed: new Set(['category_watch:food']) })).toHaveLength(0);
    });

    it('only an over-budget category shows while learning', () => {
      expect(watch({ mode: 'learning', categories: [outlook({ status: 'over', budget: 1 })] })).toHaveLength(1);
    });
  });

  describe('unusual spends', () => {
    /** Six Croma debits around Rs 1,000, a month back. */
    const history = () => [1000, 1100, 900, 1050, 950, 1000].map((rupees, i) => tx(-30 - i, rupees, { payee_key: 'croma', counterparty_name: 'Croma' }));

    it('flags a spend far above the payee\'s usual', () => {
      const big = tx(-1, 4000, { payee_key: 'croma', counterparty_name: 'Croma' });
      const [item] = watch({ rows: [...history(), big] });
      expect(item).toEqual({
        id: `unusual:${big.id}`,
        kind: 'unusual',
        text: '₹4,000 at Croma is about 4x your usual there.',
        transactionId: big.id,
        payeeKey: 'croma',
        amount: 400_000,
        copy: { variant: 'unusual', label: 'Croma', values: { amount: '₹4,000', payee: 'Croma', usual: '₹1,000', times: '4x' } },
      });
    });

    it('needs 5 past samples, a z of 3.5 and a spread', () => {
      const croma = { payee_key: 'croma', counterparty_name: 'Croma' };
      expect(watch({ rows: [...history().slice(0, 4), tx(-1, 4000, croma)] })).toHaveLength(0); // 4 samples
      expect(watch({ rows: [...history().slice(0, 5), tx(-1, 4000, croma)] })).toHaveLength(1); // 5 samples
      expect(watch({ rows: [...history(), tx(-1, 1200, croma)] })).toHaveLength(0); // z 2.7
      expect(watch({ rows: [...history(), tx(-1, 1300, croma)] })).toHaveLength(1); // z 4.0
      const same = Array.from({ length: 6 }, (_, i) => tx(-30 - i, 1000, croma));
      expect(watch({ rows: [...same, tx(-1, 9000, croma)] })).toHaveLength(0); // MAD 0: no scale to judge by
    });

    it('judges a spend by what came before it, not by what came after', () => {
      const croma = { payee_key: 'croma', counterparty_name: 'Croma' };
      const big = tx(-6, 4000, croma);
      const usualAfter = [-5, -4, -3, -2, -1, 0].map((offset) => tx(offset, 1000 + offset * 10, croma));
      expect(watch({ rows: [big, ...usualAfter] })).toHaveLength(0); // nothing before the big one to compare with
      expect(watch({ rows: [...history(), big, ...usualAfter] }).map((w) => w.transactionId)).toEqual([big.id]);
    });

    it('only looks at the last 7 days', () => {
      const croma = { payee_key: 'croma', counterparty_name: 'Croma' };
      expect(watch({ rows: [...history(), tx(-6, 4000, croma)] })).toHaveLength(1);
      expect(watch({ rows: [...history(), tx(-7, 4000, croma)] })).toHaveLength(0);
    });

    it('leaves out one-off labels, posted bills, fixed categories and dismissed spends', () => {
      const croma = { payee_key: 'croma', counterparty_name: 'Croma' };
      const oneOff = tx(-1, 4000, { ...croma, one_off: 1 });
      const bill = tx(-1, 4000, { ...croma, recurring_item_id: 'r' });
      const fixed = tx(-1, 4000, { ...croma, scope: 'recurring_expense' });
      expect(watch({ rows: [...history(), oneOff, bill, fixed] })).toHaveLength(0);
      const big = tx(-1, 4000, croma);
      expect(watch({ rows: [...history(), big], dismissed: new Set([`unusual_txn:${big.id}`]) })).toHaveLength(0);
    });

    it('falls back to the category for a payee seen less than 5 times', () => {
      const usual = [1000, 1100, 900, 1050, 950].map((rupees, i) => tx(-30 - i, rupees, { category_id: 'tech', payee_key: `shop${i}`, counterparty_name: `Shop ${i}` }));
      const big = tx(-1, 4000, { category_id: 'tech', payee_key: 'newshop', counterparty_name: 'New Shop' });
      expect(watch({ rows: [...usual, big] }).map((w) => w.transactionId)).toEqual([big.id]);
      expect(watch({ rows: [...usual, tx(-1, 4000, { payee_key: 'newshop', counterparty_name: 'New Shop' })] })).toHaveLength(0); // no category: nothing to compare with
    });

    it('names the category, not the payee, when the comparison falls back to it', () => {
      const usual = [1000, 1100, 900, 1050, 950].map((rupees, i) => tx(-30 - i, rupees, { category_id: 'tech', payee_key: `shop${i}`, counterparty_name: `Shop ${i}` }));
      const big = tx(-1, 18_999, { category_id: 'tech', payee_key: 'croma', counterparty_name: 'Croma' });
      const [item] = watch({ rows: [...usual, big], categories: [outlook({ id: 'tech', name: 'Shopping', status: 'ok' })] });
      expect(item?.text).toBe('₹18,999 at Croma is about 19x your usual Shopping spend.');
      expect(item?.text).not.toContain('there');
      expect(item?.copy).toEqual({
        variant: 'unusual_category',
        label: 'Croma',
        values: { amount: '₹18,999', payee: 'Croma', usual: '₹1,000', times: '19x', category: 'Shopping' },
      });
      // A category the outlook does not list: no name to give.
      expect(watch({ rows: [...usual, big], categories: [] })[0]?.text).toBe('₹18,999 at Croma is about 19x your usual spend in this category.');
    });

    it('is off while learning', () => {
      const big = tx(-1, 4000, { payee_key: 'croma', counterparty_name: 'Croma' });
      expect(watch({ mode: 'learning', rows: [...history(), big] })).toHaveLength(0);
    });
  });

  describe('subscription candidates', () => {
    const spotify = pattern({ payee_key: 'spotify', display_name: 'Spotify', kind: 'subscription', median_amount: 11_900, median_interval_days: 30 });

    it('suggests an untracked subscription', () => {
      expect(watch({ patterns: [spotify], rows: [tx(-30, 119, { payee_key: 'spotify' })] })).toEqual([
        {
          id: 'sub:spotify',
          kind: 'subscription_candidate',
          text: 'Spotify, ₹119 monthly. Track it as recurring?',
          payeeKey: 'spotify',
          name: 'Spotify',
          cadence: 'monthly',
          amount: 11_900,
          dayOfMonth: 19, // the default pattern's last payment: Oct 19
          copy: { variant: 'monthly', label: 'Spotify', values: { payee: 'Spotify', amount: '₹119', period: 'monthly' } },
        },
      ]);
      const yearly = watch({ patterns: [{ ...spotify, median_interval_days: 365 }] })[0];
      expect(yearly?.text).toContain('yearly');
      expect(yearly).toMatchObject({ name: 'Spotify', cadence: 'yearly' });
    });

    it('rounds the amount to whole rupees and carries the day of month of the latest payment', () => {
      const [item] = watch({ patterns: [{ ...spotify, median_amount: 11_949, last_at: '2026-10-09T23:30:00.000Z' }] });
      expect(item).toMatchObject({ amount: 11_900, dayOfMonth: 9, text: 'Spotify, ₹119 monthly. Track it as recurring?' });
      expect(item?.copy.values['amount']).toBe('₹119');
      expect(watch({ patterns: [{ ...spotify, median_amount: 11_950 }] })[0]).toMatchObject({ amount: 12_000 });
      expect(watch({ patterns: [{ ...spotify, last_at: '2026-09-30T10:00:00.000Z' }] })[0]?.dayOfMonth).toBe(30);
    });

    it('is not suggested when an active subscription item is named like the payee', () => {
      expect(watch({ patterns: [spotify], recurring: [item({ name: 'Spotify' })] })).toHaveLength(0);
      expect(watch({ patterns: [spotify], recurring: [item({ name: ' SPOTIFY. ' })] })).toHaveLength(0);
      expect(watch({ patterns: [spotify], recurring: [item({ name: 'Spotify', active: 0 })] })).toHaveLength(1);
      expect(watch({ patterns: [spotify], recurring: [item({ name: 'Spotify', kind: 'income' })] })).toHaveLength(1);
      expect(watch({ patterns: [spotify], recurring: [item({ name: 'Netflix' })] })).toHaveLength(1);
    });

    it('is not suggested once any of its rows came from a recurring item', () => {
      const rows = [tx(-60, 119, { payee_key: 'spotify' }), tx(-30, 119, { payee_key: 'spotify', recurring_item_id: 'r1' })];
      expect(watch({ patterns: [spotify], rows })).toHaveLength(0);
    });

    it('respects dismiss, suppression, inactivity, other kinds and low confidence', () => {
      expect(watch({ patterns: [spotify], dismissed: new Set(['subscription_candidate:spotify']) })).toHaveLength(0);
      expect(watch({ patterns: [{ ...spotify, suppressed: 1 }] })).toHaveLength(0);
      expect(watch({ patterns: [{ ...spotify, count_120d: 0 }] })).toHaveLength(0);
      expect(watch({ patterns: [{ ...spotify, kind: 'habit' }] })).toHaveLength(0);
      expect(watch({ patterns: [{ ...spotify, alpha: 1, beta: 3 }] })).toHaveLength(0);
    });

    it('is off while learning', () => {
      expect(watch({ mode: 'learning', patterns: [spotify] })).toHaveLength(0);
    });
  });

  it('lists hot categories, then unusual spends, then subscription candidates', () => {
    const croma = { payee_key: 'croma', counterparty_name: 'Croma' };
    const history = [1000, 1100, 900, 1050, 950, 1000].map((rupees, i) => tx(-30 - i, rupees, croma));
    const big = tx(-1, 4000, croma);
    const out = watch({
      categories: [outlook()],
      rows: [...history, big],
      patterns: [pattern({ payee_key: 'spotify', display_name: 'Spotify', kind: 'subscription', median_amount: 11_900, median_interval_days: 30 })],
    });
    expect(out.map((w) => w.kind)).toEqual(['category_hot', 'unusual', 'subscription_candidate']);
  });
});
