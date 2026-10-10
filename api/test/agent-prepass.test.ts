import { describe, expect, it } from 'vitest';

import { clarificationText, extractPhrases, runPrepass, selectEntities } from '../src/features/agent/prepass';
import { parseTimeHint } from '../src/features/agent/range';
import { nowBlock, toInstantRange, wallIso } from '../src/features/agent/dates';
import type { EntityMatch } from '../src/features/agent/tools';
import { NOW, USER, fakeQueries } from './agent-fixtures';
import { testDb } from './db';

const TZ = 'Asia/Kolkata';
const hint = (text: string) => parseTimeHint(text, TZ, NOW);
const range = (text: string) => {
  const h = hint(text);
  return h ? [h.from, h.to] : null;
};

describe('time hints (no LLM)', () => {
  it('resolves relative phrases in the user timezone', () => {
    // NOW = Monday 2026-10-05 10:00 IST
    expect(range('how much did I spend today')).toEqual(['2026-10-05', '2026-10-05']);
    expect(range('yesterday?')).toEqual(['2026-10-04', '2026-10-04']);
    expect(range('spend in the last 7 days')).toEqual(['2026-09-29', '2026-10-05']);
    expect(range('last week')).toEqual(['2026-09-29', '2026-10-05']);
    expect(range('this week')).toEqual(['2026-10-05', '2026-10-05']);
    expect(range('this month')).toEqual(['2026-10-01', '2026-10-31']);
    expect(range('last month')).toEqual(['2026-09-01', '2026-09-30']);
    expect(range('this year so far')).toEqual(['2026-01-01', '2026-10-05']);
    expect(range('last year')).toEqual(['2025-01-01', '2025-12-31']);
    expect(range('the past 3 months')).toEqual(['2026-07-06', '2026-10-05']);
  });

  it('resolves month names with and without a year (the latest month that has started)', () => {
    expect(range('spending in June 2026')).toEqual(['2026-06-01', '2026-06-30']);
    expect(range('how much in june?')).toEqual(['2026-06-01', '2026-06-30']);
    expect(range('in december')).toEqual(['2025-12-01', '2025-12-31']); // not yet reached this year
    expect(range('in feb 2024')).toEqual(['2024-02-01', '2024-02-29']);
    expect(range('for october')).toEqual(['2026-10-01', '2026-10-31']);
    expect(range('in 2024')).toEqual(['2024-01-01', '2024-12-31']);
  });

  it('resolves a month span', () => {
    expect(range('from April to June 2026')).toEqual(['2026-04-01', '2026-06-30']);
    expect(range('between november and february')).toBeNull(); // compare-ish words / ambiguous year handling stays with the model
  });

  it('does not treat the verb "may" as a month', () => {
    expect(hint('I may spend more')).toBeNull();
    expect(range('what did I spend in May?')).toEqual(['2026-05-01', '2026-05-31']);
    expect(range('May 2026')).toEqual(['2026-05-01', '2026-05-31']);
  });

  it('stays silent when the question has finer dates, a comparison or two separate months', () => {
    expect(hint('between 10 July and 20 July')).toBeNull();
    expect(hint('on July 4th')).toBeNull();
    expect(hint('from 2026-06-01 to 2026-06-15')).toBeNull();
    expect(hint('compare July with June')).toBeNull();
    expect(hint('June vs July')).toBeNull();
    expect(hint('did my spending change from June 2026 to July 2026')).toBeNull();
    expect(hint('june and march')).toBeNull();
    expect(hint('hello')).toBeNull();
  });

  it('builds half-open UTC instants for inclusive local dates and the NOW block', () => {
    expect(toInstantRange(TZ, { year: 2026, month: 6, day: 1 }, { year: 2026, month: 6, day: 30 })).toEqual({
      from: '2026-05-31T18:30:00.000Z',
      to: '2026-06-30T18:30:00.000Z',
    });
    expect(toInstantRange('UTC', { year: 2026, month: 2, day: 28 }, { year: 2026, month: 2, day: 28 })).toEqual({ from: '2026-02-28T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' });
    expect(wallIso(TZ, { year: 2026, month: 6, day: 30 }, 23, 59, 59, 999_999)).toBe('2026-06-30T23:59:59.999999+05:30');
    expect(nowBlock(TZ, NOW)).toContain('Today: 2026-10-05 (Monday). Timezone: Asia/Kolkata. Currency: INR.');
    expect(nowBlock(TZ, NOW)).toContain('Last month: 2026-09-01 to 2026-09-30.');
  });
});

describe('entity phrases', () => {
  it('keeps runs of non-stopwords as bigrams and words, longest first', () => {
    expect(extractPhrases('How much did I spend at Swiggy Instamart in June 2026?')).toEqual(['swiggy instamart', 'instamart', 'swiggy']);
    expect(extractPhrases('How much did I spend in June 2026?')).toEqual([]);
    expect(extractPhrases('what share of spending was rent')).toEqual(['rent']);
  });

  it('caps the number of phrases', () => {
    expect(extractPhrases('alpha beta gamma delta epsilon zeta eta theta iota kappa').length).toBeLessThanOrEqual(6);
  });
});

const match = (phrase: string, type: 'payee' | 'category', name: string, score: number, similarity: number): EntityMatch => ({
  phrase,
  type,
  id: type === 'payee' ? name.toLowerCase() : `cat-${name.toLowerCase()}`,
  name,
  score,
  similarity,
  txnCount: 10,
});

describe('entity selection and ambiguity', () => {
  it('picks an exact name even when a longer name contains the word', () => {
    const { entities, ambiguities } = selectEntities(
      [match('swiggy', 'payee', 'Swiggy', 1, 1), match('swiggy', 'payee', 'Swiggy Instamart', 1, 0.5)],
      ['swiggy'],
    );
    expect(ambiguities).toEqual([]);
    expect(entities).toEqual([{ type: 'payee', id: 'swiggy', name: 'Swiggy', exact: true }]);
  });

  it('prefers the longer phrase and drops the words it consumed', () => {
    const { entities } = selectEntities(
      [match('swiggy instamart', 'payee', 'Swiggy Instamart', 1, 1), match('swiggy', 'payee', 'Swiggy', 1, 1), match('instamart', 'payee', 'Swiggy Instamart', 1, 0.5)],
      ['swiggy instamart', 'instamart', 'swiggy'],
    );
    expect(entities.map((e) => e.name)).toEqual(['Swiggy Instamart']);
  });

  it('reports an ambiguity when two candidates score alike and neither is exact', () => {
    const { entities, ambiguities } = selectEntities(
      [match('coffee', 'payee', 'Cafe Coffee Day', 1, 0.47), match('coffee', 'payee', 'Coffee Day Express', 1, 0.37)],
      ['coffee'],
    );
    expect(entities).toEqual([]);
    expect(ambiguities).toHaveLength(1);
    expect(ambiguities[0]?.options.map((o) => o.name)).toEqual(['Cafe Coffee Day', 'Coffee Day Express']);
    expect(clarificationText(ambiguities[0]!)).toBe('Did you mean **Cafe Coffee Day** or **Coffee Day Express**? I found more than one of your payees close to “coffee”.');
  });

  it('resolves a clear winner, ignores weak matches and keeps payee vs category apart', () => {
    const { entities, ambiguities } = selectEntities(
      [match('food', 'category', 'Food & Dining', 1, 0.42), match('food', 'payee', 'Food Bazaar', 1, 0.5), match('zzz', 'payee', 'Other', 0.3, 0.1), match('amazn', 'payee', 'Amazon', 0.8, 0.6), match('amazn', 'payee', 'Amazon Prime', 0.55, 0.3)],
      ['food', 'zzz', 'amazn'],
    );
    expect(ambiguities).toEqual([]);
    expect(entities.map((e) => `${e.type}:${e.name}:${e.exact}`).sort()).toEqual(['category:Food & Dining:false', 'payee:Amazon:false', 'payee:Food Bazaar:false']);
  });

  it('lists three options with commas', () => {
    expect(
      clarificationText({ phrase: 'x', options: ['A', 'B', 'C'].map((name) => ({ type: 'category' as const, id: name, name, exact: false })) }),
    ).toBe('Did you mean **A**, **B** or **C**? I found more than one of your categories close to “x”.');
  });
});

describe('pre-pass with the database', () => {
  const pre = (text: string, db: ReturnType<typeof fakeQueries>) => runPrepass({ text, tz: TZ, nowMs: NOW, userId: USER, memory: null, db: testDb(), queries: db.queries });

  it('skips the database when the question names no entity', async () => {
    const db = fakeQueries();
    const result = await pre('How much did I spend in June 2026?', db);
    expect(db.calls()).toHaveLength(0);
    expect(result.range?.from).toBe('2026-06-01');
    expect(result.entities).toEqual([]);
  });

  it('survives a failing entity lookup (the model can call resolve_entities itself)', async () => {
    const db = fakeQueries({}, { fail: { resolve_entities: new Error('boom') } });
    const result = await pre('spend at swiggy', db);
    expect(result.entities).toEqual([]);
    expect(result.clarification).toBeNull();
  });

  it('looks all phrases up in ONE query', async () => {
    const db = fakeQueries({ resolve_entities: { matches: [] } });
    await pre('how much did I spend at swiggy instamart', db);
    expect(db.calls()).toEqual([{ name: 'resolve_entities', params: { phrases: ['swiggy instamart', 'instamart', 'swiggy'] } }]);
  });
});
