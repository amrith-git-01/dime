import { describe, expect, it } from 'vitest';

import { isUsableTemplate, parseStoredCopy, renderTemplate, subscriptionCandidateText, summaryTarget, unusualRatio, unusualText } from '../src/features/engine/copy';
import type { SummaryInput } from '../src/features/engine/copy';

describe('unusual and subscription copy', () => {
  it('rounds the multiple: a whole number from 10x, one decimal below', () => {
    expect(unusualRatio(400_000, 100_000)).toBe(4);
    expect(unusualRatio(320_000, 100_000)).toBe(3.2);
    expect(unusualRatio(1_899_900, 156_000)).toBe(12);
    expect(unusualRatio(1_000_000, 100_000)).toBe(10);
    expect(unusualRatio(999_000, 100_000)).toBe(10); // 9.99 rounds to one decimal: 10
    expect(unusualRatio(100, 0)).toBe(0);
  });

  it('says "there" for a payee comparison and names the category for a category one', () => {
    const base = { amount: 1_899_900, payee: 'Croma', usual: 156_000 };
    expect(unusualText(base)).toBe('₹18,999 at Croma is about 12x your usual there.');
    expect(unusualText({ ...base, basis: 'payee' })).toBe('₹18,999 at Croma is about 12x your usual there.');
    expect(unusualText({ ...base, basis: 'category', category: 'Shopping' })).toBe('₹18,999 at Croma is about 12x your usual Shopping spend.');
    expect(unusualText({ ...base, basis: 'category' })).toBe('₹18,999 at Croma is about 12x your usual spend in this category.');
  });

  it('shows a subscription in whole rupees', () => {
    expect(subscriptionCandidateText({ name: 'Netflix', amount: 64_949, yearly: false })).toBe('Netflix, ₹649 monthly. Track it as recurring?');
    expect(subscriptionCandidateText({ name: 'Prime', amount: 149_950, yearly: true })).toBe('Prime, ₹1,500 yearly. Track it as recurring?');
  });
});

const values = { category: 'Food', projected: '₹6.2k', usual: '₹4.5k' };

describe('renderTemplate (the placeholder guard)', () => {
  it('fills known placeholders', () => {
    expect(renderTemplate('{category} is heading for {projected}; you usually spend {usual}.', values)).toBe('Food is heading for ₹6.2k; you usually spend ₹4.5k.');
    expect(renderTemplate('  Easy on {category} this week.  ', values)).toBe('Easy on Food this week.');
    expect(renderTemplate('Careful with {category} (it adds up) - really!', values)).toBe('Careful with Food (it adds up) - really!');
  });

  it('rejects a digit, in any script', () => {
    expect(renderTemplate('You will spend 6200 on {category}.', values)).toBeNull();
    expect(renderTemplate('About 3x more on {category}.', values)).toBeNull();
    expect(renderTemplate('{category} १२ times.', values)).toBeNull(); // Devanagari digits
  });

  it('rejects currency signs, percent signs and currency words', () => {
    for (const bad of ['Spent ₹ on {category}.', 'Spent $ on {category}.', '{category} is up % this month.', 'Rs on {category}.', 'Some rupees on {category}.', 'INR spent on {category}.']) {
      expect(renderTemplate(bad, values), bad).toBeNull();
    }
  });

  it('rejects numbers written as words', () => {
    for (const bad of ['{category} is up twice.', 'About three times the usual on {category}.', 'Nearly double on {category}.', 'Ten thousand on {category}.', 'Half your {category} budget.']) {
      expect(renderTemplate(bad, values), bad).toBeNull();
    }
    expect(renderTemplate('Often {category}, never a surprise.', values)).not.toBeNull(); // "ten" inside a word is fine
  });

  it('rejects an unknown placeholder, a known name without a value, and stray braces', () => {
    expect(renderTemplate('{category} will hit {total}.', values)).toBeNull();
    expect(renderTemplate('{category} with {payee}.', values)).toBeNull();
    expect(renderTemplate('{constructor} on {category}.', values)).toBeNull();
    expect(renderTemplate('{category on {category}.', values)).toBeNull();
    expect(renderTemplate('{{category}}', values)).toBeNull();
    expect(renderTemplate('{ category }', values)).toBeNull();
  });

  it('allows only Latin letters and plain punctuation besides placeholders', () => {
    for (const bad of [
      'Up \u00B2 on {category}.', // superscript two
      '\u00BD of your {category}.', // vulgar fraction
      'Phase \u2162 for {category}.', // roman numeral
      '{category} \u0A68 times.', // Gurmukhi digit
      '{category} \u2460 times.', // circled digit
      'Caf\u00E9 {category}.', // non-Latin letter
      '{category} \u{1F4B8}.', // emoji
      'Mail me at x@y {category}.',
      'Go to {category}/now.',
      'Note: {category}.',
    ]) {
      expect(renderTemplate(bad, values), bad).toBeNull();
    }
  });

  it('rejects the full set of English and Hinglish number words, with plurals', () => {
    for (const bad of [
      'Sixty on {category}.',
      'Thousands on {category}.',
      'A hazaar on {category}.',
      'Paanch orders of {category}.',
      'Ek order of {category}.',
      'Sau on {category}.',
      'A dozen of {category}.',
      'A lakh on {category}.',
      'Once on {category}.',
      'Quarter of {category}.',
      'Twenty-five on {category}.',
      'No one on {category}.',
      'Nineteen on {category}.',
    ]) {
      expect(renderTemplate(bad, values), bad).toBeNull();
    }
    expect(renderTemplate('Do watch {category}, it often does well.', values)).not.toBeNull(); // "do" is English
  });

  it('rejects links, UPI ids and web addresses, and a template with no placeholder', () => {
    for (const bad of [
      'Pay {amount} at www.evil.example now for {category}.',
      'See http {category}.',
      'Send it by UPI for {category}.',
      'Visit shop.com for {category}.',
      'Try shop.in for {category}.',
    ]) {
      expect(renderTemplate(bad, { ...values, amount: '₹1' }), bad).toBeNull();
    }
    expect(renderTemplate('You are doing great this month.', values)).toBeNull();
    expect(renderTemplate('Stupid good on {category}.', values)).not.toBeNull(); // "upi" inside a word is fine
  });

  it('keeps each placeholder once and set off from letters and other placeholders', () => {
    expect(renderTemplate('{category} and {category} again.', values)).toBeNull();
    expect(renderTemplate('Mostly{category} today.', values)).toBeNull();
    expect(renderTemplate('{category}s are up.', values)).toBeNull();
    expect(renderTemplate('{category}{usual}', values)).toBeNull();
    expect(renderTemplate('{category}, {usual}.', values)).toBe('Food, \u20B94.5k.');
    expect(renderTemplate('({category})', values)).toBe('(Food)');
  });

  it('rejects empty, too long, multi-line and markup text', () => {
    expect(renderTemplate('   ', values)).toBeNull();
    expect(renderTemplate(`{category} ${'a'.repeat(150)}`, values)).toBeNull();
    expect(renderTemplate(`{category} ${'a'.repeat(149)}`, values)).not.toBeNull();
    expect(renderTemplate('Line one\nline {category}.', values)).toBeNull();
    expect(renderTemplate('<b>{category}</b>', values)).toBeNull();
  });

  it('does not let a value reshape the sentence ($ patterns are literal)', () => {
    expect(renderTemplate('On {category}.', { category: '$& $1' })).toBe('On $& $1.');
  });
});

describe('isUsableTemplate', () => {
  it('checks a template against the names a card has', () => {
    expect(isUsableTemplate('{category} is at {projected}.', ['category', 'projected', 'usual'])).toBe(true);
    expect(isUsableTemplate('{category} is at {budget}.', ['category', 'projected', 'usual'])).toBe(false);
    expect(isUsableTemplate('It is 5 now.', ['category'])).toBe(false);
    expect(isUsableTemplate('No placeholder here.', ['category'])).toBe(false);
  });
});

describe('parseStoredCopy', () => {
  it('reads the stored shape and ignores anything else', () => {
    expect(parseStoredCopy('{"summary":{"situation":"on_track","template":"x"},"watch":{"hot:1":"y"}}')).toEqual({ summary: { situation: 'on_track', template: 'x' }, watch: { 'hot:1': 'y' } });
    expect(parseStoredCopy('{}')).toEqual({});
    expect(parseStoredCopy(null)).toBeNull();
    expect(parseStoredCopy('not json')).toBeNull();
    expect(parseStoredCopy('{"watch":{"a":5}}')).toBeNull();
  });
});

describe('summaryTarget', () => {
  const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
    mode: 'full',
    historyDays: 90,
    p50: 2_890_000,
    budget: 3_000_000,
    chanceUnder: 0.71,
    watchCategory: null,
    spentSoFar: 1_000_000,
    ...over,
  });

  it('names the situation the way the summary text bands it, and lists its values', () => {
    expect(summaryTarget(input())).toEqual({ situation: 'on_track', values: { landing: '₹28.9k', spent: '₹10,000', budget: '₹30k', chance: '71%' } });
    expect(summaryTarget(input({ chanceUnder: 0.5, watchCategory: 'Food' }))?.situation).toBe('close_call_watch');
    expect(summaryTarget(input({ chanceUnder: 0.1 }))?.situation).toBe('over');
    expect(summaryTarget(input({ budget: null, chanceUnder: null, watchCategory: 'Food' }))).toEqual({
      situation: 'pace_watch',
      values: { landing: '₹28.9k', spent: '₹10,000', category: 'Food' },
    });
  });

  it('has none while learning', () => {
    expect(summaryTarget(input({ mode: 'learning' }))).toBeNull();
  });
});
