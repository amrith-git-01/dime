import { describe, expect, it } from 'vitest';

import { inr, inrCompact, pastMonthText, summaryText } from '../src/features/engine/copy';
import { categoryOutlook, flexibleShares, forecastLanding, safeToday, weekdayUsual } from '../src/features/engine/forecast';
import type { ForecastInput, ForecastProfile } from '../src/features/engine/forecast';
import { dateN, hashSeed, mulberry32, percentile } from '../src/features/engine/math';

/** Thursday 2026-10-22 in a 31-day month: nine days remain (Fri 23 .. Sat 31). */
const TODAY = { year: 2026, month: 10, day: 22 };
const todayN = dateN(TODAY);
const monthStartN = dateN({ ...TODAY, day: 1 });
const monthEndN = dateN({ ...TODAY, day: 31 });

const flat = (value: number, over: Partial<ForecastProfile> = {}): ForecastProfile => ({
  weekday: Array.from({ length: 7 }, () => ({ values: [value, value, value, value], median: value })),
  overallDailyMedian: value,
  mode: 'full',
  widthFactor: 1,
  historyDays: 90,
  ...over,
});

/** Varied history: the same five values (oldest first) on every weekday. */
const ramp = (over: Partial<ForecastProfile> = {}): ForecastProfile => {
  const values = [1000, 1300, 1600, 1900, 2200];
  return { ...flat(1600), weekday: Array.from({ length: 7 }, () => ({ values, median: 1600 })), ...over };
};

const input = (profile: ForecastProfile, over: Partial<ForecastInput> = {}): ForecastInput => ({
  profile,
  todayN,
  monthStartN,
  monthEndN,
  spentSoFar: 50_000,
  flexibleSpentSoFar: 30_000,
  flexibleSpentToday: 0,
  billsStillDue: 0,
  budget: null,
  rng: mulberry32(7),
  ...over,
});

describe('seeded random numbers and percentiles', () => {
  it('the same seed gives the same stream, floats in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const first = Array.from({ length: 5 }, () => a());
    expect(first).toEqual(Array.from({ length: 5 }, () => b()));
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(first[0]);
  });

  it('hashSeed is stable and tells strings apart', () => {
    expect(hashSeed('user:2026-10-22')).toBe(hashSeed('user:2026-10-22'));
    expect(hashSeed('user:2026-10-22')).not.toBe(hashSeed('user:2026-10-23'));
  });

  it('percentile interpolates and handles the edges', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4, 5], 1)).toBe(5);
  });
});

describe('forecastLanding', () => {
  it('adds spent so far, bills still due and the flexible days left (no spread when every day is alike)', () => {
    // Rest of today: usual 1000 minus 400 already spent; then nine days of 1000.
    const r = forecastLanding(input(flat(1000), { flexibleSpentToday: 400, billsStillDue: 64_900 }));
    expect(r.flexibleRemaining).toEqual({ p10: 9600, p50: 9600, p90: 9600 });
    expect(r.landing).toEqual({ p10: 124_500, p50: 124_500, p90: 124_500 });
    expect(r.chanceUnder).toBeNull();
  });

  it('spending more than the weekday usual today leaves nothing for the rest of today', () => {
    const r = forecastLanding(input(flat(1000), { flexibleSpentToday: 5000 }));
    expect(r.flexibleRemaining.p50).toBe(9000);
  });

  it('is repeatable with a seed and ordered p10 <= p50 <= p90', () => {
    const a = forecastLanding(input(ramp(), { rng: mulberry32(99) }));
    const b = forecastLanding(input(ramp(), { rng: mulberry32(99) }));
    expect(a).toEqual(b);
    expect(a.landing.p10).toBeLessThan(a.landing.p50);
    expect(a.landing.p50).toBeLessThan(a.landing.p90);
    // The rest of today (1600) plus nine days drawn from 1000..2200: recent values weigh more, so the median sits above the plain mean (1600) of each day.
    expect(a.flexibleRemaining.p50).toBeGreaterThan(1600 + 9 * 1600);
    expect(a.flexibleRemaining.p50).toBeLessThan(1600 + 9 * 1800);
  });

  it('chanceUnder is the share of draws within the budget', () => {
    const exact = forecastLanding(input(flat(1000)));
    expect(forecastLanding(input(flat(1000), { budget: exact.landing.p50 })).chanceUnder).toBe(1);
    expect(forecastLanding(input(flat(1000), { budget: exact.landing.p50 - 1 })).chanceUnder).toBe(0);

    const spread = forecastLanding(input(ramp()));
    const atMedian = forecastLanding(input(ramp(), { budget: spread.landing.p50 })).chanceUnder as number;
    expect(atMedian).toBeGreaterThan(0.4);
    expect(atMedian).toBeLessThan(0.65);
    expect(forecastLanding(input(ramp(), { budget: spread.landing.p90 })).chanceUnder as number).toBeGreaterThan(0.8);
    expect(forecastLanding(input(ramp(), { budget: spread.landing.p10 })).chanceUnder as number).toBeLessThan(0.2);
  });

  it('weighs recent weeks more (half-life 30 days)', () => {
    // One day left. Twenty weekly values: the oldest ten are 0, the newest ten 10000; the newest ten carry about 84% of the weight.
    const values = [...Array.from({ length: 10 }, () => 0), ...Array.from({ length: 10 }, () => 10_000)];
    const profile: ForecastProfile = { ...flat(0), weekday: Array.from({ length: 7 }, () => ({ values, median: 5000 })) };
    const r = forecastLanding(input(profile, { todayN: monthEndN - 1, budget: 50_000, flexibleSpentToday: 99_999 }));
    // Landing is 50000 when the single draw is 0 (<= budget) and 60000 otherwise.
    expect(r.chanceUnder as number).toBeGreaterThan(0.11);
    expect(r.chanceUnder as number).toBeLessThan(0.21);
  });

  it('scales the spread by widthFactor and keeps the median', () => {
    const narrow = forecastLanding(input(ramp()));
    const wide = forecastLanding(input(ramp({ widthFactor: 2 })));
    const widthOf = (r: typeof narrow) => r.landing.p90 - r.landing.p10;
    expect(Math.abs(wide.landing.p50 - narrow.landing.p50)).toBeLessThanOrEqual(1);
    expect(Math.abs(widthOf(wide) - 2 * widthOf(narrow))).toBeLessThanOrEqual(2);
  });

  it('warming widens ranges 1.5x and falls back to all days for a weekday with under two samples', () => {
    const full = forecastLanding(input(ramp()));
    const warming = forecastLanding(input(ramp({ mode: 'warming' })));
    expect(Math.abs(warming.landing.p50 - full.landing.p50)).toBeLessThanOrEqual(1);
    expect(Math.abs(warming.landing.p90 - warming.landing.p10 - 1.5 * (full.landing.p90 - full.landing.p10))).toBeLessThanOrEqual(2);

    // Fridays have no history: their days are drawn from all the other days (all 1000), and today's usual is Thursday's.
    const sparse = flat(1000, { mode: 'warming' });
    sparse.weekday[5] = { values: [], median: 0 };
    sparse.weekday[6] = { values: [1000], median: 1000 };
    const r = forecastLanding(input(sparse));
    expect(r.flexibleRemaining.p50).toBe(1000 + 9 * 1000);
    expect(weekdayUsual(sparse, 5)).toBe(1000); // the overall median
    expect(weekdayUsual(sparse, 4)).toBe(1000);
  });

  it('learning mode carries this month\'s daily rate forward, +-20%', () => {
    const profile = flat(0, { mode: 'learning', historyDays: 90 });
    // 22000 flexible over 22 days = 1000 a day; ten days left counting today (nothing spent today yet).
    const r = forecastLanding(input(profile, { flexibleSpentSoFar: 22_000, billsStillDue: 1000, budget: null }));
    expect(r.flexibleRemaining).toEqual({ p10: 8000, p50: 10_000, p90: 12_000 });
    expect(r.landing).toEqual({ p10: 59_000, p50: 61_000, p90: 63_000 });
    expect(r.chanceUnder).toBeNull();
    // What is already spent today is part of today's day, not on top of it.
    expect(forecastLanding(input(profile, { flexibleSpentSoFar: 22_000, flexibleSpentToday: 3000 })).flexibleRemaining.p50).toBe(7000);
  });

  it('learning mode on the last day of the month: a day at the daily rate less what is spent, never negative', () => {
    const profile = flat(0, { mode: 'learning', historyDays: 90 });
    // 31000 over 31 days = 1000 a day.
    const last = (flexibleSpentToday: number) => forecastLanding(input(profile, { todayN: monthEndN, flexibleSpentSoFar: 31_000, flexibleSpentToday })).flexibleRemaining;
    expect(last(0)).toEqual({ p10: 800, p50: 1000, p90: 1200 });
    expect(last(400).p50).toBe(600);
    expect(last(2500)).toEqual({ p10: 0, p50: 0, p90: 0 });
  });

  it('learning mode counts only the days the user has existed and estimates the chance from the range', () => {
    const profile = flat(0, { mode: 'learning', historyDays: 4 });
    // Five days of history (4 complete plus today): 22000 / 5 = 4400 a day, ten days left counting today.
    const r = forecastLanding(input(profile, { flexibleSpentSoFar: 22_000, budget: 80_000 }));
    expect(r.flexibleRemaining.p50).toBe(44_000);
    const at = (budget: number) => forecastLanding(input(profile, { flexibleSpentSoFar: 22_000, budget })).chanceUnder;
    expect(at(r.landing.p50)).toBeCloseTo(0.5);
    expect(at(r.landing.p90)).toBeCloseTo(0.9);
    expect(at(r.landing.p10)).toBeCloseTo(0.1);
    expect(at(r.landing.p90 * 3)).toBe(1);
    expect(at(1)).toBe(0);
  });

  it('the last day of the month has only the rest of today left (no spread)', () => {
    const r = forecastLanding(input(ramp(), { todayN: monthEndN, flexibleSpentToday: 600 }));
    // Saturday's usual is 1600: 1000 left.
    expect(r.flexibleRemaining).toEqual({ p10: 1000, p50: 1000, p90: 1000 });
    expect(r.landing.p10).toBe(r.landing.p90);
  });

  it('a 28-day month: two days left on the 26th', () => {
    const feb = { year: 2026, month: 2, day: 26 };
    const r = forecastLanding(
      input(flat(1000), { todayN: dateN(feb), monthStartN: dateN({ ...feb, day: 1 }), monthEndN: dateN({ ...feb, day: 28 }) }),
    );
    expect(r.flexibleRemaining.p50).toBe(1000 + 2 * 1000);
  });
});

describe('safeToday', () => {
  /** 50000 spent before today (nothing yet today), 10000 of bills still to come. */
  const base = { todayN, monthEndN, spentSoFar: 50_000, spentToday: 0, billsStillDue: 10_000 };

  it('shares what is left of the budget over today and the days after it, equal when days weigh the same', () => {
    // 100000 - 50000 - 10000 = 40000 over 10 days (Thu 22 .. Sat 31).
    expect(safeToday({ ...base, profile: flat(1000), budget: 100_000 })).toEqual({ amount: 4000, usual: 1000, weekday: 'Thu' });
  });

  it('what is spent today comes off it one for one, down to zero', () => {
    const today = (spentToday: number) => safeToday({ ...base, spentSoFar: 50_000 + spentToday, spentToday, profile: flat(1000), budget: 100_000 }).amount;
    expect(today(0)).toBe(4000);
    expect(today(1000)).toBe(3000);
    expect(today(3999)).toBe(1);
    expect(today(4000)).toBe(0);
    expect(today(9000)).toBe(0);
  });

  it('gives heavy days more', () => {
    const profile = flat(1000);
    profile.weekday[4] = { values: [2000, 2000, 2000, 2000], median: 2000 }; // Thursdays: 22 and 29
    // Weights: 2000 + 2000 + eight days of 1000 = 12000, so today gets 2000/12000 of 40000.
    expect(safeToday({ ...base, profile, budget: 100_000 }).amount).toBe(6667);
    profile.weekday[4] = { values: [0, 0, 0, 0], median: 0 };
    expect(safeToday({ ...base, profile, budget: 100_000 }).amount).toBe(0);
  });

  it('is shared equally when every weekday median is zero', () => {
    expect(safeToday({ ...base, profile: flat(0), budget: 100_000 }).amount).toBe(4000);
  });

  it('is zero once the budget is spent', () => {
    expect(safeToday({ ...base, profile: flat(1000), budget: 55_000 }).amount).toBe(0);
  });

  it('has no amount without a budget, but still the usual for the weekday', () => {
    expect(safeToday({ ...base, profile: flat(1250), budget: null })).toEqual({ amount: null, usual: 1250, weekday: 'Thu' });
  });
});

describe('categoryOutlook', () => {
  const cat = { id: 'food', spent: 300_000, flexSpent: 250_000, billsDue: 0, baseline: 400_000, budget: null, share: 0.5 };

  it('projects spent + bills + its share of the flexible spend to come', () => {
    expect(categoryOutlook({ ...cat, billsDue: 20_000 }, 100_000)).toMatchObject({ p50: 370_000, status: 'ok' });
  });

  it('is hot at 1.25x the usual and Rs 500 over it', () => {
    // flex projection: 250000 + 0.5 * 500000 = 500000 = 1.25 * 400000.
    expect(categoryOutlook(cat, 500_000).status).toBe('hot');
    expect(categoryOutlook(cat, 499_000).status).toBe('ok');
    // Big ratio, small amount: 80 -> 130 is 1.6x but only Rs 50 more.
    expect(categoryOutlook({ ...cat, baseline: 8000, spent: 6000, flexSpent: 6000, share: 0 }, 0).status).toBe('ok');
    expect(categoryOutlook({ ...cat, baseline: 8000, spent: 13_000, flexSpent: 13_000, share: 0 }, 0).status).toBe('ok');
    expect(categoryOutlook({ ...cat, baseline: 40_000, spent: 90_000, flexSpent: 90_000, share: 0 }, 0).status).toBe('hot');
    expect(categoryOutlook({ ...cat, baseline: null }, 900_000).status).toBe('ok');
  });

  it('a monthly-bill category that has already paid is not hot, however the flexible projection is', () => {
    // Bills & Utilities: Tata Power paid (Rs 1,791 against a usual of 1,752); nothing more is expected this month.
    const bills = { id: 'bills', spent: 179_100, flexSpent: 179_100, billsDue: 0, baseline: 175_200, budget: null, share: 0.2 };
    // The share method adds 0.2 * 2,000,000 on top and flags it; the category's own rest-of-month (0) does not.
    expect(categoryOutlook(bills, 2_000_000)).toMatchObject({ p50: 579_100, status: 'hot' });
    expect(categoryOutlook({ ...bills, restOfMonth: 0 }, 2_000_000)).toMatchObject({ p50: 179_100, status: 'ok' });
  });

  it('a steady category still projects its own remaining spend and can run hot', () => {
    const food = { id: 'food', spent: 250_000, flexSpent: 250_000, billsDue: 0, baseline: 400_000, budget: null, share: 0.5 };
    expect(categoryOutlook({ ...food, restOfMonth: 100_000 }, 0)).toMatchObject({ p50: 350_000, status: 'ok' });
    expect(categoryOutlook({ ...food, restOfMonth: 250_000 }, 0)).toMatchObject({ p50: 500_000, status: 'hot' });
    expect(categoryOutlook({ ...food, restOfMonth: null }, 500_000)).toMatchObject({ p50: 500_000, status: 'hot' }); // too little history: the share method
  });

  it('is over when the projection passes the category budget (over wins)', () => {
    expect(categoryOutlook({ ...cat, budget: 500_000 }, 500_000)).toMatchObject({ p50: 550_000, status: 'over' });
    expect(categoryOutlook({ ...cat, budget: 550_000 }, 500_000).status).toBe('hot');
  });

  it('shares come from the baseline months, else from this month so far (ids compared in lower case)', () => {
    const profile = {
      categories: {
        FOOD: { monthlyTotals: [300, 300], median: 300, mad: 0 },
        fun: { monthlyTotals: [100, 100], median: 100, mad: 0 },
      },
    };
    const shares = flexibleShares(profile, new Map([['food', 1]]));
    expect(shares.get('food')).toBeCloseTo(0.75);
    expect(shares.get('fun')).toBeCloseTo(0.25);
    const fresh = flexibleShares({ categories: {} }, new Map([['food', 300], ['fun', 100]]));
    expect(fresh.get('food')).toBeCloseTo(0.75);
    expect(flexibleShares({ categories: {} }, new Map()).size).toBe(0);
  });
});

describe('copy', () => {
  it('formats rupees', () => {
    expect(inr(400_000)).toBe('₹4,000');
    expect(inr(11_950)).toBe('₹119.50');
    expect(inrCompact(450_000)).toBe('₹4,500');
    expect(inrCompact(2_890_000)).toBe('₹28.9k');
    expect(inrCompact(3_000_000)).toBe('₹30k');
    expect(inrCompact(12_500_000)).toBe('₹1.3L');
    expect(inrCompact(0)).toBe('₹0');
  });

  it('writes the one-line summary by how likely the budget holds', () => {
    const base = { mode: 'full' as const, historyDays: 90, p50: 2_890_000, budget: 3_000_000, watchCategory: null, spentSoFar: 1_000_000 };
    expect(summaryText({ ...base, chanceUnder: 0.8 })).toBe('On track: likely ₹28.9k against ₹30k.');
    expect(summaryText({ ...base, chanceUnder: 0.5, watchCategory: 'Food' })).toBe('Close call: likely ₹28.9k against ₹30k. Watch Food.');
    expect(summaryText({ ...base, chanceUnder: 0.1 })).toBe('Heading over budget: likely ₹28.9k against ₹30k.');
    expect(summaryText({ ...base, budget: null, chanceUnder: null })).toBe('On pace for about ₹28.9k this month.');
    expect(summaryText({ ...base, mode: 'learning', historyDays: 9, chanceUnder: null })).toBe('Learning your patterns (9 of 30 days). ₹10,000 spent so far this month.');
    expect(pastMonthText({ month: 9, spent: 2_500_000, budget: 3_000_000 })).toBe('You spent ₹25k in September, within the ₹30k budget.');
    expect(pastMonthText({ month: 9, spent: 2_500_000, budget: null })).toBe('You spent ₹25k in September.');
  });
});
