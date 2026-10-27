import { describe, expect, it } from 'vitest';

import {
  buildSnapshot,
  historyFromRows,
  isNotable,
  medianCents,
  pickTitle,
  pickWin,
  slidesFor,
} from '../src/features/reports/snapshot';
import type { CategoryInfo, EarlierMonth, ReportDebit, SnapshotInput } from '../src/features/reports/snapshot';

const NOW = '2026-11-01T02:30:00.000Z';
const pad = (n: number) => String(n).padStart(2, '0');

const FOOD = 'cat-food';
const SHOP = 'cat-shop';
const BILLS = 'cat-bills';
const TRANSPORT = 'cat-transport';
const CATEGORIES = new Map<string, CategoryInfo>([
  [FOOD, { name: 'Food & Dining', icon_name: 'UtensilsCrossed', color: '#FF6B6B' }],
  [SHOP, { name: 'Shopping', icon_name: 'ShoppingBag', color: '#A855F7' }],
  [BILLS, { name: 'Bills & Utilities', icon_name: 'Zap', color: '#FBBF24' }],
  [TRANSPORT, { name: 'Transport', icon_name: 'Car', color: '#4ECDC4' }],
]);

let seq = 0;
/** A debit at noon IST (06:30Z) on a day of October 2026, with a payee of its own unless one is given. */
function debit(day: number, rupees: number, over: Partial<ReportDebit> = {}): ReportDebit {
  seq += 1;
  return { amountCents: rupees * 100, at: `2026-10-${pad(day)}T06:30:00.000Z`, payeeKey: `payee-${seq}`, name: `Payee ${seq}`, categoryId: null, ...over };
}

const earlierMonth = (periodKey: string, rupees: number, byCategory: Record<string, number> = {}): EarlierMonth => ({
  periodKey,
  spentCents: rupees * 100,
  byCategory: new Map(Object.entries(byCategory).map(([id, r]) => [id, r * 100])),
});

function input(debits: ReportDebit[], over: Partial<SnapshotInput> = {}): SnapshotInput {
  return { year: 2026, month: 10, nowIso: NOW, debits, incomeCents: 0, categories: CATEGORIES, earlier: [], ...over };
}

/** Seven debits: spent 8,100 with Swiggy visited 3 times, rent the biggest spend, an unnamed small one. */
function october(): ReportDebit[] {
  return [
    debit(1, 1000, { payeeKey: 'swiggy', name: 'Swiggy', categoryId: FOOD }),
    debit(2, 500, { payeeKey: 'swiggy', name: 'swiggy ', categoryId: FOOD }),
    debit(3, 300, { payeeKey: 'swiggy', name: 'SWIGGY', categoryId: FOOD }),
    debit(5, 2000, { payeeKey: 'amazon', name: 'Amazon', categoryId: SHOP }),
    debit(8, 4000, { payeeKey: 'landlord', name: 'Landlord', categoryId: BILLS }),
    debit(15, 200, { payeeKey: 'uber', name: 'Uber', categoryId: TRANSPORT }),
    debit(20, 100, { payeeKey: 'unknown', name: null }),
  ];
}

describe('medianCents', () => {
  it('one value is itself, two values average (rounded), three take the middle, none is 0', () => {
    expect(medianCents([])).toBe(0);
    expect(medianCents([500])).toBe(500);
    expect(medianCents([100, 301])).toBe(201); // 200.5 rounds up
    expect(medianCents([900, 100, 500])).toBe(500);
    expect(medianCents([4, 1, 3, 2])).toBe(3); // 2.5 rounds up
  });
});

describe('isNotable', () => {
  it('needs at least Rs 500 AND at least 25% of the usual, in either direction', () => {
    expect(isNotable(250_000, 1_000_000)).toBe(true); // exactly 25% of 10,000
    expect(isNotable(249_999, 1_000_000)).toBe(false);
    expect(isNotable(-250_000, 1_000_000)).toBe(true);
    expect(isNotable(50_000, 100_000)).toBe(true); // usual 1,000: 25% is 250, so the Rs 500 floor decides
    expect(isNotable(49_999, 100_000)).toBe(false);
    expect(isNotable(0, 100_000)).toBe(false);
  });
});

describe('buildSnapshot: a full month', () => {
  const snap = buildSnapshot(input(october(), { incomeCents: 5_200_000 }));

  it('totals, identity and the slide list', () => {
    expect(snap).toMatchObject({
      version: 1,
      period_key: '2026-10',
      year: 2026,
      month: 10,
      timezone: 'Asia/Kolkata',
      generated_at: NOW,
      debit_count: 7,
      spent: '8100.00',
      income: '52000.00',
      usual_spent: null,
      vs_usual: null,
      vs_usual_delta: null,
    });
    // 7 debits: no rhythm. The 11-day no-spend streak is the win.
    expect(snap.slides).toEqual(['cover', 'damage', 'lineup', 'regular', 'moment', 'win', 'closing']);
  });

  it('categories: top 3 by amount, then Other (id null) with the rest', () => {
    expect(snap.categories).toEqual([
      { id: BILLS, name: 'Bills & Utilities', icon_name: 'Zap', color: '#FBBF24', amount: '4000.00', share: 0.4938, count: 1 },
      { id: SHOP, name: 'Shopping', icon_name: 'ShoppingBag', color: '#A855F7', amount: '2000.00', share: 0.2469, count: 1 },
      { id: FOOD, name: 'Food & Dining', icon_name: 'UtensilsCrossed', color: '#FF6B6B', amount: '1800.00', share: 0.2222, count: 3 },
      { id: null, name: 'Other', icon_name: null, color: null, amount: '300.00', share: 0.037, count: 2 },
    ]);
  });

  it('has no Other bucket when there are three categories or fewer, and names uncategorized spend', () => {
    const few = buildSnapshot(input([debit(1, 100, { categoryId: FOOD }), debit(2, 300), debit(3, 50, { categoryId: SHOP }), debit(4, 50, { categoryId: SHOP }), debit(5, 50)]));
    expect(few.categories.map((c) => [c.id, c.name, c.amount])).toEqual([
      [null, 'Uncategorized', '350.00'],
      [SHOP, 'Shopping', '100.00'],
      [FOOD, 'Food & Dining', '100.00'],
    ]);
  });

  it('top payee: most visits (name of the oldest row), biggest spend and busiest day', () => {
    expect(snap.top_payee).toEqual({ payee_key: 'swiggy', display_name: 'Swiggy', count: 3, amount: '1800.00' });
    expect(snap.biggest_spend).toEqual({ amount: '4000.00', display_name: 'Landlord', category_name: 'Bills & Utilities', date: '2026-10-08' });
    expect(snap.busiest_day).toEqual({ date: '2026-10-08', amount: '4000.00', count: 1 });
  });

  it('weekdays Monday to Sunday, weekend share, no-spend days and the longest streak', () => {
    // Oct 1 2026 is a Thursday: Mon 2,000 (5th), Tue 100 (20th), Thu 1,000+4,000+200, Fri 500, Sat 300.
    expect(snap.weekday).toEqual({ totals: ['2000.00', '100.00', '0.00', '5200.00', '500.00', '300.00', '0.00'], peak_index: 3, weekend_share: 0.037 });
    expect(snap.no_spend_days).toBe(24); // 7 days with a debit
    expect(snap.longest_no_spend_streak).toBe(11); // 21st to 31st
    expect(snap.win).toEqual({ kind: 'no_spend_streak', days: 11, start: '2026-10-21', end: '2026-10-31' });
    expect(snap.first_week_share).toBe(0.4691); // 3,800 of 8,100 in days 1-7
  });

  it('title: the rent is 49% of the month', () => {
    expect(snap.title).toEqual({ id: 'one_big_splurge', evidence: { share: 0.4938, amount: '4000.00', display_name: 'Landlord' } });
  });
});

describe('buildSnapshot: usual spend and vs_usual', () => {
  const debits = () => october(); // spent 8,100

  it('one earlier month is the usual itself', () => {
    const s = buildSnapshot(input(debits(), { earlier: [earlierMonth('2026-09', 5000)] }));
    expect(s).toMatchObject({ usual_spent: '5000.00', vs_usual: 'up', vs_usual_delta: '3100.00' });
  });

  it('two earlier months: the mean', () => {
    const s = buildSnapshot(input(debits(), { earlier: [earlierMonth('2026-09', 6000), earlierMonth('2026-08', 10000)] }));
    expect(s).toMatchObject({ usual_spent: '8000.00', vs_usual: 'same', vs_usual_delta: '100.00' }); // 100 < Rs 500
  });

  it('three earlier months: the median, in any input order', () => {
    const s = buildSnapshot(input(debits(), { earlier: [earlierMonth('2026-07', 1000), earlierMonth('2026-09', 9000), earlierMonth('2026-08', 20000)] }));
    // median 9,000: 900 below is over Rs 500 but under 25% (2,250), so still "same".
    expect(s).toMatchObject({ usual_spent: '9000.00', vs_usual: 'same', vs_usual_delta: '900.00' });
  });

  it('uses only the three newest earlier months', () => {
    const s = buildSnapshot(
      input(debits(), { earlier: [earlierMonth('2026-09', 8000), earlierMonth('2026-08', 9000), earlierMonth('2026-07', 7000), earlierMonth('2026-06', 100000)] }),
    );
    expect(s.usual_spent).toBe('8000.00');
  });

  it('down when well under the usual; the delta is the absolute difference', () => {
    const s = buildSnapshot(input(debits(), { earlier: [earlierMonth('2026-09', 20000)] }));
    expect(s).toMatchObject({ usual_spent: '20000.00', vs_usual: 'down', vs_usual_delta: '11900.00' });
  });

  it('thresholds: Rs 500 floor for a small usual, 25% for a large one', () => {
    const against = (first: number) =>
      buildSnapshot(input([debit(1, first), debit(2, 10), debit(3, 10), debit(4, 10), debit(5, 10)], { earlier: [earlierMonth('2026-09', 540)] }));
    // usual 540 (25% is 135, so the floor decides): spent 1,040 is +500 exactly -> up; 1,039 -> same
    expect(against(1000).vs_usual).toBe('up');
    expect(against(999).vs_usual).toBe('same');
  });
});

describe('buildSnapshot: IST month edges', () => {
  it('a debit at 2026-09-30T19:00Z is October 1st, 00:30 in Kolkata', () => {
    const s = buildSnapshot(
      input([
        debit(1, 100, { at: '2026-09-30T19:00:00.000Z' }), // Oct 1 00:30 IST
        debit(31, 300, { at: '2026-10-31T18:29:59.000Z' }), // Oct 31 23:59:59 IST
        debit(12, 50),
        debit(13, 50),
        debit(14, 50),
      ]),
    );
    expect(s.first_week_share).toBe(0.1818); // 100 of 550
    expect(s.busiest_day).toEqual({ date: '2026-10-31', amount: '300.00', count: 1 });
    // Oct 1 and Oct 31 are Thursday and Saturday.
    expect(s.weekday.totals[3]).toBe('100.00');
    expect(s.weekday.totals[5]).toBe('300.00');
    expect(s.no_spend_days).toBe(26);
  });

  it('counts the days of the month, not of a 31-day month (September has 30)', () => {
    const s = buildSnapshot({ ...input([]), month: 9, debits: ['01', '02', '03', '04', '05'].map((d) => debit(1, 10, { at: `2026-09-${d}T06:30:00.000Z` })) });
    expect(s.period_key).toBe('2026-09');
    expect(s.no_spend_days).toBe(25);
  });
});

describe('buildSnapshot: a sparse month', () => {
  const sparse = () => [debit(2, 40), debit(9, 60), debit(16, 20), debit(23, 80), debit(30, 100)];

  it('keeps the four core slides plus the moment and the streak win, and nothing that needs more data', () => {
    const s = buildSnapshot(input(sparse()));
    expect(s.debit_count).toBe(5);
    expect(s.top_payee).toBeNull();
    expect(s.slides).toEqual(['cover', 'damage', 'lineup', 'moment', 'win', 'closing']);
    // Every gap is 6 days long; the first one wins.
    expect(s.win).toEqual({ kind: 'no_spend_streak', days: 6, start: '2026-10-03', end: '2026-10-08' });
    // Oct 2 2026 is a Friday, and so are the 9th, 16th, 23rd and 30th.
    expect(s.weekday.peak_index).toBe(4);
    expect(s.weekday.weekend_share).toBe(0);
    expect(s.no_spend_days).toBe(26);
    expect(s.title.id).toBe('ghost'); // biggest is 100 of 300 (33%), no regular payee, no weekend: 26 empty days
  });
});

describe('top payee', () => {
  it('needs 3 visits; ties on visits go to the larger amount', () => {
    const two = buildSnapshot(input([debit(1, 10, { payeeKey: 'a' }), debit(2, 10, { payeeKey: 'a' }), debit(3, 10), debit(4, 10), debit(5, 10)]));
    expect(two.top_payee).toBeNull();
    expect(two.slides).not.toContain('regular');

    const tie = buildSnapshot(
      input([
        debit(1, 10, { payeeKey: 'a', name: 'A' }),
        debit(2, 10, { payeeKey: 'a', name: 'A' }),
        debit(3, 10, { payeeKey: 'a', name: 'A' }),
        debit(4, 50, { payeeKey: 'b', name: 'B' }),
        debit(5, 50, { payeeKey: 'b', name: 'B' }),
        debit(6, 50, { payeeKey: 'b', name: 'B' }),
      ]),
    );
    expect(tie.top_payee).toMatchObject({ payee_key: 'b', display_name: 'B', count: 3, amount: '150.00' });
  });

  it('unnamed spending (payee key "unknown") is never the regular', () => {
    const s = buildSnapshot(input([1, 2, 3, 4, 5].map((d) => debit(d, 10, { payeeKey: 'unknown', name: null }))));
    expect(s.top_payee).toBeNull();
  });
});

describe('slidesFor (gates)', () => {
  const base = { hasTopPayee: false, hasBiggest: false, debitCount: 5, win: { kind: 'none' } as const };

  it('cover, damage, lineup and closing are always there', () => {
    expect(slidesFor(base)).toEqual(['cover', 'damage', 'lineup', 'closing']);
  });

  it('regular needs a top payee, moment a biggest spend, rhythm 15+ debits, win a win', () => {
    expect(slidesFor({ ...base, hasTopPayee: true })).toContain('regular');
    expect(slidesFor({ ...base, hasBiggest: true })).toContain('moment');
    expect(slidesFor({ ...base, debitCount: 14 })).not.toContain('rhythm');
    expect(slidesFor({ ...base, debitCount: 15 })).toContain('rhythm');
    expect(slidesFor({ ...base, win: { kind: 'lowest_month', spent: '1.00', previous_lowest: '2.00', months_compared: 2 } })).toContain('win');
  });

  it('keeps the fixed order', () => {
    const all = slidesFor({ hasTopPayee: true, hasBiggest: true, debitCount: 15, win: { kind: 'no_spend_streak', days: 3, start: 'a', end: 'b' } });
    expect(all).toEqual(['cover', 'damage', 'lineup', 'regular', 'moment', 'rhythm', 'win', 'closing']);
  });
});

describe('pickTitle (first match wins)', () => {
  const base = {
    spentCents: 100_000,
    debitCount: 10,
    medianDebitCents: 10_000,
    weekendCents: 0,
    firstWeekCents: 0,
    noSpendDays: 0,
    biggest: { amountCents: 10_000, name: 'Shop' },
    topPayee: null as { payee_key: string; display_name: string; count: number } | null,
  };
  const payee = (count: number) => ({ payee_key: 'k', display_name: 'K', count });

  it('steady is the default', () => {
    expect(pickTitle(base)).toEqual({ id: 'steady', evidence: {} });
    expect(pickTitle({ ...base, spentCents: 0, biggest: null }).id).toBe('steady');
  });

  it('one_big_splurge: biggest spend is at least 35%', () => {
    expect(pickTitle({ ...base, biggest: { amountCents: 35_000, name: 'TV' } })).toEqual({
      id: 'one_big_splurge',
      evidence: { share: 0.35, amount: '350.00', display_name: 'TV' },
    });
    expect(pickTitle({ ...base, biggest: { amountCents: 34_999, name: 'TV' } }).id).toBe('steady');
  });

  it('loyalist: 8+ visits, or at least 25% of the debits', () => {
    expect(pickTitle({ ...base, debitCount: 40, topPayee: payee(8) })).toEqual({ id: 'loyalist', evidence: { payee_key: 'k', display_name: 'K', count: 8 } });
    expect(pickTitle({ ...base, debitCount: 40, topPayee: payee(7) }).id).toBe('steady');
    expect(pickTitle({ ...base, debitCount: 12, topPayee: payee(3) }).id).toBe('loyalist');
    expect(pickTitle({ ...base, debitCount: 13, topPayee: payee(3) }).id).toBe('steady');
  });

  it('weekend_warrior: at least half the spend on Saturday and Sunday', () => {
    expect(pickTitle({ ...base, weekendCents: 50_000 })).toEqual({ id: 'weekend_warrior', evidence: { weekend_share: 0.5 } });
    expect(pickTitle({ ...base, weekendCents: 49_999 }).id).toBe('steady');
  });

  it('payday_sprinter: at least 45% in the first week', () => {
    expect(pickTitle({ ...base, firstWeekCents: 45_000 })).toEqual({ id: 'payday_sprinter', evidence: { first_week_share: 0.45 } });
    expect(pickTitle({ ...base, firstWeekCents: 44_999 }).id).toBe('steady');
  });

  it('thousand_cuts: 40+ debits and a median debit of at most 5% of the spend', () => {
    expect(pickTitle({ ...base, debitCount: 40, medianDebitCents: 5_000 })).toEqual({ id: 'thousand_cuts', evidence: { debit_count: 40, median_debit: '50.00' } });
    expect(pickTitle({ ...base, debitCount: 39, medianDebitCents: 5_000 }).id).toBe('steady');
    expect(pickTitle({ ...base, debitCount: 40, medianDebitCents: 5_001 }).id).toBe('steady');
  });

  it('ghost: 10+ days without a debit', () => {
    expect(pickTitle({ ...base, noSpendDays: 10 })).toEqual({ id: 'ghost', evidence: { no_spend_days: 10 } });
    expect(pickTitle({ ...base, noSpendDays: 9 }).id).toBe('steady');
  });

  it('priority: each rule beats everything below it', () => {
    const everything = {
      ...base,
      debitCount: 40,
      medianDebitCents: 1_000,
      weekendCents: 60_000,
      firstWeekCents: 60_000,
      noSpendDays: 12,
      biggest: { amountCents: 40_000, name: 'TV' },
      topPayee: payee(9),
    };
    expect(pickTitle(everything).id).toBe('one_big_splurge');
    expect(pickTitle({ ...everything, biggest: { amountCents: 10_000, name: 'x' } }).id).toBe('loyalist');
    expect(pickTitle({ ...everything, biggest: { amountCents: 10_000, name: 'x' }, topPayee: null }).id).toBe('weekend_warrior');
    expect(pickTitle({ ...everything, biggest: { amountCents: 10_000, name: 'x' }, topPayee: null, weekendCents: 0 }).id).toBe('payday_sprinter');
    expect(pickTitle({ ...everything, biggest: { amountCents: 10_000, name: 'x' }, topPayee: null, weekendCents: 0, firstWeekCents: 0 }).id).toBe('thousand_cuts');
    expect(pickTitle({ ...everything, biggest: { amountCents: 10_000, name: 'x' }, topPayee: null, weekendCents: 0, firstWeekCents: 0, debitCount: 10 }).id).toBe('ghost');
  });
});

describe('pickWin', () => {
  const noStreak = { days: 0, start: '', end: '' };
  const top = (id: string, rupees: number) => ({ id, amount: rupees * 100 });
  const args = (over: Partial<Parameters<typeof pickWin>[0]> = {}) => ({
    spentCents: 800_000,
    topCategories: [top(FOOD, 1000)],
    categories: CATEGORIES,
    // 7,000 a month: this month's 8,000 is not the lowest, so only the category / streak rules can win.
    earlier: [earlierMonth('2026-09', 7000, { [FOOD]: 3000 }), earlierMonth('2026-08', 7000, { [FOOD]: 3000 }), earlierMonth('2026-07', 7000, { [FOOD]: 3000 })],
    streak: noStreak,
    ...over,
  });

  it('category_down: a top category well under its median of earlier months', () => {
    expect(pickWin(args())).toEqual({
      kind: 'category_down',
      category_id: FOOD,
      category_name: 'Food & Dining',
      icon_name: 'UtensilsCrossed',
      color: '#FF6B6B',
      amount: '1000.00',
      usual: '3000.00',
      delta: '2000.00',
    });
  });

  it('category_down threshold: at least 25% of the usual (and Rs 500)', () => {
    expect(pickWin(args({ topCategories: [top(FOOD, 2250)] })).kind).toBe('category_down'); // 750 = exactly 25% of 3,000
    expect(pickWin(args({ topCategories: [top(FOOD, 2251)] })).kind).toBe('none');
    // usual 1,000: 25% is 250, the Rs 500 floor wins
    const small = args({ earlier: [earlierMonth('2026-09', 7000, { [FOOD]: 1000 })] });
    expect(pickWin({ ...small, topCategories: [top(FOOD, 500)] }).kind).toBe('category_down');
    expect(pickWin({ ...small, topCategories: [top(FOOD, 501)] }).kind).toBe('none');
  });

  it('a month without the category counts as 0 in the median; the biggest drop wins', () => {
    const earlier = [earlierMonth('2026-09', 7000, { [FOOD]: 4000, [SHOP]: 3000 }), earlierMonth('2026-08', 7000, { [FOOD]: 4000, [SHOP]: 3000 }), earlierMonth('2026-07', 7000)];
    const win = pickWin(args({ earlier, topCategories: [top(SHOP, 100), top(FOOD, 100)] }));
    // medians: food 4,000, shop 3,000 -> food drops more
    expect(win).toMatchObject({ kind: 'category_down', category_id: FOOD, usual: '4000.00' });
    // Only the last two of three months had the category: the median is 0, so nothing to beat.
    const sparse = [earlierMonth('2026-09', 7000, { [FOOD]: 4000 }), earlierMonth('2026-08', 7000), earlierMonth('2026-07', 7000)];
    expect(pickWin(args({ earlier: sparse })).kind).toBe('none');
  });

  it('no earlier months, no category win', () => {
    expect(pickWin(args({ earlier: [] })).kind).toBe('none');
  });

  it('no_spend_streak: 3+ days, after category_down', () => {
    expect(pickWin(args({ streak: { days: 3, start: '2026-10-04', end: '2026-10-06' } }))).toMatchObject({ kind: 'category_down' });
    expect(pickWin(args({ earlier: [], streak: { days: 3, start: '2026-10-04', end: '2026-10-06' } }))).toEqual({
      kind: 'no_spend_streak',
      days: 3,
      start: '2026-10-04',
      end: '2026-10-06',
    });
    expect(pickWin(args({ earlier: [], streak: { days: 2, start: 'a', end: 'b' } })).kind).toBe('none');
  });

  it('lowest_month: under every earlier month, needs two of them', () => {
    const earlier = [earlierMonth('2026-09', 9000), earlierMonth('2026-08', 8500)];
    expect(pickWin(args({ topCategories: [], earlier }))).toEqual({ kind: 'lowest_month', spent: '8000.00', previous_lowest: '8500.00', months_compared: 2 });
    expect(pickWin(args({ topCategories: [], earlier: [earlierMonth('2026-09', 9000)] })).kind).toBe('none');
    expect(pickWin(args({ topCategories: [], earlier, spentCents: 850_000 })).kind).toBe('none'); // equal is not lower
  });

  it('the lowest-month comparison looks at every earlier month, not just the three behind the usual', () => {
    const earlier = [earlierMonth('2026-09', 9000), earlierMonth('2026-08', 9500), earlierMonth('2026-07', 9200), earlierMonth('2026-06', 7000)];
    expect(pickWin(args({ topCategories: [], earlier })).kind).toBe('none');
  });
});

describe('historyFromRows', () => {
  it('groups the history query by month, newest first, and leaves uncategorized out of the category map', () => {
    const months = historyFromRows([
      { ym: '2026-08', category_id: FOOD, total: 100 },
      { ym: '2026-09', category_id: FOOD, total: 200 },
      { ym: '2026-09', category_id: null, total: 50 },
      { ym: '2026-09', category_id: SHOP, total: 25 },
    ]);
    expect(months.map((m) => [m.periodKey, m.spentCents])).toEqual([
      ['2026-09', 275],
      ['2026-08', 100],
    ]);
    expect([...(months[0]?.byCategory ?? [])]).toEqual([
      [FOOD, 200],
      [SHOP, 25],
    ]);
  });
});
