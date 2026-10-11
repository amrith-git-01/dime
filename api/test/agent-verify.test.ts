import { describe, expect, it } from 'vitest';

import { EMPTY_RESULT_ANSWER, fallbackAnswer, NO_DATA_ANSWER } from '../src/features/agent/fallback';
import { formatInr } from '../src/features/agent/money';
import type { SqlRun } from '../src/features/agent/state';
import { extractMentions, mentionMatches, numbersIn, verifyAnswer } from '../src/features/agent/verify';

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
  it('formats Indian grouping', () => {
    expect(formatInr(1234567.5)).toBe('₹12,34,567.50');
    expect(formatInr(999)).toBe('₹999');
    expect(formatInr(100000)).toBe('₹1,00,000');
    expect(formatInr(-1500)).toBe('-₹1,500');
    expect(formatInr(0.4)).toBe('₹0.40');
  });
});

const runOf = (columns: string[], rows: SqlRun['rows'], over: Partial<SqlRun> = {}): SqlRun => ({ id: 'r1', columns, rows, shown: rows.length, truncated: false, ...over });

describe('fallback answer', () => {
  it('lists the first rows of the last result that has rows, money with Indian grouping and percentages with %', () => {
    const rows = [['Rent', 90000, 60, 3], ['Food', 4000.5, 26.7, 12]];
    expect(fallbackAnswer([runOf(['category', 'total', 'share_pct', 'n'], rows)])).toBe(
      `Here's what I found:
- category: Rent, total: ₹90,000, share pct: 60%, n: 3
- category: Food, total: ₹4,000.50, share pct: 26.7%, n: 12`,
    );
  });

  it('caps at 5 rows and says so; prefers the latest result with rows over a later empty one', () => {
    const many = runOf(['payee', 'spent'], Array.from({ length: 8 }, (_, i) => [`P${i}`, 100 * (i + 1)]));
    const text = fallbackAnswer([many, runOf(['payee', 'spent'], [])]);
    expect(text.match(/^- /gm)).toHaveLength(5);
    expect(text).toContain('(First 5 of 8 rows.)');
    expect(fallbackAnswer([runOf(['a'], [], { truncated: true })])).toBe(EMPTY_RESULT_ANSWER);
  });

  it('does not format counts, ids or years as money, and shows NULL as a dash', () => {
    expect(fallbackAnswer([runOf(['transaction_count', 'year', 'category_id', 'avg_spend', 'note'], [[1200, 2026, 'abc', 250.5, null]])])).toBe(
      `Here's what I found:
- transaction count: 1200, year: 2026, category id: abc, avg spend: ₹250.50, note: -`,
    );
  });

  it('apologises when there are no results at all', () => {
    expect(fallbackAnswer([])).toBe(NO_DATA_ANSWER);
  });

  it('every figure verifies against its own source (by construction)', () => {
    const run = runOf(['category', 'total', 'share_pct'], [['Rent', 90000.25, 60.1], ['Food', 4000, 26.7]]);
    expect(verifyAnswer(fallbackAnswer([run]), numbersIn(run.rows)).ok).toBe(true);
  });
});
