import { describe, expect, it } from 'vitest';

import { NO_DATA_ANSWER, templateAnswer } from '../src/features/agent/template';
import type { ToolResult } from '../src/features/agent/template';
import { extractMentions, mentionMatches, numbersIn, verifyAnswer } from '../src/features/agent/verify';
import { withMoneyDisplay, formatInr } from '../src/features/agent/money';

const allowed = numbersIn({ debit: '18388.50', debit_display: '₹18,388.50', credit: 85000, share: 30.5, count: 43, period: { from: '2026-06-01' } });

describe('number extraction', () => {
  it('finds currency, shorthand, percent and large numbers but ignores years, dates and small counts', () => {
    const checked = (t: string) => extractMentions(t).filter((m) => m.checked).map((m) => m.raw);
    expect(checked('You spent ₹18,388.50 on 14 June 2026, 3 times (12%).')).toEqual(['₹18,388.50', '12%']);
    expect(checked('Rs. 1,23,456 and INR 500 and 5k and 1.2 lakh and 2 crore')).toEqual(['Rs. 1,23,456', 'INR 500', '5k', '1.2 lakh', '2 crore']);
    expect(checked('2026-06-01 to 2026-06-30, 12 transactions, rank 3')).toEqual([]);
    expect(checked('a total of 18388.50 and 1,200')).toEqual(['18388.50', '1,200']);
  });

  it('collects numbers from nested results, numeric strings and display strings', () => {
    expect(numbersIn({ a: [1, { b: '2.50' }], c: '₹1,23,456.75', d: null, e: 'no digits' })).toEqual([1, 2.5, 123456.75]);
    expect(numbersIn({ x: -5 })).toEqual([5]);
  });
});

describe('verification against tool results', () => {
  it('accepts exact figures in any formatting (₹, commas of either grouping, plain)', () => {
    for (const text of ['₹18,388.50', 'Rs 18388.50', 'INR 18,388.50', '₹85,000', '₹85000', '85,000.00']) {
      expect(verifyAnswer(`You had ${text}.`, allowed).ok, text).toBe(true);
    }
  });

  it('accepts whole-rupee rounding but not a different amount', () => {
    expect(verifyAnswer('About ₹18,389 or ₹18,388.', allowed).ok).toBe(true);
    const bad = verifyAnswer('You spent ₹18,400.', allowed);
    expect(bad).toEqual({ ok: false, unmatched: ['₹18,400'] });
    expect(verifyAnswer('You spent ₹18,388.60.', allowed).ok).toBe(false); // two decimals must match to the paisa
  });

  it('accepts lakh / crore / k shorthand rounded to the shown precision', () => {
    const big = numbersIn({ total: 123456.78 });
    expect(verifyAnswer('About ₹1.2 lakh', big).ok).toBe(true);
    expect(verifyAnswer('About 1.23 lakh', big).ok).toBe(true);
    expect(verifyAnswer('About ₹1.5 lakh', big).ok).toBe(false);
    expect(verifyAnswer('around 123k', big).ok).toBe(true);
    expect(verifyAnswer('around ₹2 crore', big).ok).toBe(false);
  });

  it('checks percentages and never trips on years, days or small counts', () => {
    expect(verifyAnswer('That is 30.5% of spending (or 31%).', allowed).ok).toBe(true);
    expect(verifyAnswer('That is 45% of spending.', allowed)).toEqual({ ok: false, unmatched: ['45%'] });
    expect(verifyAnswer('In June 2026 you made 43 transactions on 5 days.', allowed).ok).toBe(true);
  });

  it('allows numbers the user wrote themselves', () => {
    const withQuestion = [...allowed, ...numbersIn('expenses over ₹5,000')];
    expect(verifyAnswer('Over ₹5,000 you had 3 expenses.', withQuestion).ok).toBe(true);
  });

  it('uses magnitude (a delta of -5000 backs "₹5,000 less")', () => {
    expect(verifyAnswer('You spent ₹5,000 less.', numbersIn({ delta: -5000 })).ok).toBe(true);
  });

  it('mentionMatches is strict for amounts with decimals', () => {
    expect(mentionMatches({ value: 12.5, decimals: 1, multiplier: 1 }, 12.5)).toBe(true);
    expect(mentionMatches({ value: 12.5, decimals: 1, multiplier: 1 }, 12.56)).toBe(false);
  });
});

describe('money display', () => {
  it('formats Indian grouping and adds display twins only for money keys', () => {
    expect(formatInr(1234567.5)).toBe('₹12,34,567.50');
    expect(formatInr(999)).toBe('₹999');
    expect(formatInr(100000)).toBe('₹1,00,000');
    expect(formatInr(-1500)).toBe('-₹1,500');
    expect(formatInr(0.4)).toBe('₹0.40');
    const out = withMoneyDisplay({ debit: 100000, count: 3, share: 12.5, nested: [{ total: '2500.5' }], days: [{ debit: 5 }] }, new Set(['debit', 'total']), new Set(['days']));
    expect(out).toEqual({
      debit: '100000.00',
      debit_display: '₹1,00,000',
      count: 3,
      share: 12.5,
      nested: [{ total: '2500.50', total_display: '₹2,500.50' }],
      days: [{ debit: 5 }],
    });
  });
});

const result = (name: ToolResult['name'], data: Record<string, unknown>, args: Record<string, unknown> = {}): ToolResult => ({ name, args, ok: true, data, error: null, ms: 1, rows: 1 });

describe('template answer', () => {
  it('summarizes the last useful tool result from its own display values', () => {
    expect(templateAnswer([result('spending_summary', { period: { from: '2026-06-01', to: '2026-06-30' }, count: 0, debit_display: '₹0' })])).toBe('I found no transactions for 2026-06-01 to 2026-06-30.');
    expect(
      templateAnswer([
        result('category_breakdown', {
          period: { from: '2026-06-01', to: '2026-06-30' },
          total_display: '₹10,000',
          categories: [{ name: 'Food', total_display: '₹6,000', share: 60 }, { name: 'Rent', total_display: '₹4,000', share: 40 }],
        }),
      ]),
    ).toBe('For 2026-06-01 to 2026-06-30 the total was **₹10,000**. Biggest categories: Food ₹6,000 (60%), Rent ₹4,000 (40%).');
    expect(
      templateAnswer([
        result('compare_periods', {
          period_a: { from: '2026-07-01', to: '2026-07-31' },
          period_b: { from: '2026-06-01', to: '2026-06-30' },
          a: { debit_display: '₹9,000' },
          b: { debit_display: '₹10,000' },
          delta: { debit_pct: -10 },
        }),
      ]),
    ).toBe('Spending was **₹9,000** for 2026-07-01 to 2026-07-31 against **₹10,000** for 2026-06-01 to 2026-06-30 (down 10%).');
    expect(
      templateAnswer([
        result('budget_status', { period: { from: '2026-09-01', to: '2026-09-30' }, monthly: { budget_display: '₹60,000', spent_display: '₹70,000', remaining_display: '-₹10,000', remaining: '-10000.00', budget: '60000.00', pct_used: 116.7 } }),
      ]),
    ).toBe('You have spent **₹70,000** of your **₹60,000** budget for 2026-09-01 to 2026-09-30 (116.7% used, over by ₹10,000).');
  });

  it('skips failed results, prefers the latest good one and falls back to an apology', () => {
    const failed: ToolResult = { ...result('spending_summary', {}), ok: false, data: null, error: 'x' };
    expect(templateAnswer([failed])).toBe(NO_DATA_ANSWER);
    expect(templateAnswer([])).toBe(NO_DATA_ANSWER);
    expect(templateAnswer([result('resolve_entities', { matches: [{ name: 'Swiggy' }] }), failed])).toBe('The closest matches are Swiggy.');
  });

  it('every template figure verifies against its own source (by construction)', () => {
    const data = { period: { from: '2026-06-01', to: '2026-06-30' }, count: 43, debit: '18388.50', debit_display: '₹18,388.50', debit_count: 40, credit: '85000.00', credit_display: '₹85,000', net: '66611.50', net_display: '₹66,611.50' };
    const text = templateAnswer([result('spending_summary', data)]);
    expect(verifyAnswer(text, numbersIn(data)).ok).toBe(true);
  });
});
