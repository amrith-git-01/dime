/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
import { beforeEach, describe, expect, it } from 'vitest';

import { shapeEntities } from '../src/features/agent/entities';
import { defaultQueries } from '../src/features/agent/queries';
import { seedCategory, seedTransaction, seedUser, testDb, USER_ID } from './db';

const OTHER = '22222222-2222-2222-2222-222222222222';

const q = defaultQueries;
const db = () => testDb();
// The query documents are free-form JSON: tests read them with loose access.
type Doc = Record<string, any>;

const at = (day: number, hhmm = '10:00'): string => `2026-06-${String(day).padStart(2, '0')}T${hhmm}:00.000Z`;
const tx = (over: Parameters<typeof seedTransaction>[0]) => seedTransaction({ transaction_at: at(10), ...over });

let FOOD = '';

beforeEach(async () => {
  await seedUser(OTHER);
  FOOD = await seedCategory({ name: 'Dining Out' });
});

describe('resolve_entities (trigram matching on D1)', () => {
  const resolve = async (phrases: string[], userId = USER_ID) => (await q.resolve_entities(db(), userId, { phrases })) as { matches: Doc[] };

  beforeEach(async () => {
    for (let i = 0; i < 3; i++) await tx({ amount: '10', counterparty_name: 'Swiggy' });
    await tx({ amount: '10', counterparty_name: 'SWIGGY' });
    for (let i = 0; i < 2; i++) await tx({ amount: '10', counterparty_name: 'Swiggy Instamart' });
    await tx({ amount: '10', counterparty_name: 'Zomato' });
    await tx({ amount: '10', counterparty_name: 'Zomato', deleted_at: '2026-06-02T00:00:00.000Z' });
  });

  it('ranks an exact name first, scores a typo, and counts transactions per payee', async () => {
    const swiggy = (await resolve(['swiggy'])).matches.filter((m) => m['type'] === 'payee');
    expect(swiggy.map((m) => [m['id'], m['name'], m['score'], m['similarity'], m['txn_count']])).toEqual([
      ['swiggy', 'Swiggy', 1, 1, 4], // 'Swiggy' (3) and 'SWIGGY' (1) share the key; the most frequent spelling is the name
      ['swiggy instamart', 'Swiggy Instamart', 1, 0.412, 2], // word_similarity 1 (a whole leading word), similarity 7/17
    ]);
    const typo = (await resolve(['swigy'])).matches.filter((m) => m['type'] === 'payee');
    expect(typo[0]).toMatchObject({ id: 'swiggy', score: 0.667, similarity: 0.625 });
    expect(typo[1]).toMatchObject({ id: 'swiggy instamart' });
  });

  it('finds system and own categories, but not another user\'s', async () => {
    await seedCategory({ name: 'Secret Dining', user_id: OTHER });
    const names = (await resolve(['dining'])).matches.filter((m) => m['type'] === 'category').map((m) => m['name']);
    expect(names).toEqual(expect.arrayContaining(['Food & Dining', 'Dining Out']));
    expect(names).not.toContain('Secret Dining');
    const own = (await resolve(['dining out'])).matches.find((m) => m['type'] === 'category');
    expect(own).toMatchObject({ id: FOOD, name: 'Dining Out', score: 1, similarity: 1, txn_count: 0 });
  });

  it('drops weak matches (below 0.4), short phrases and duplicates; keeps at most 3 per kind and phrase', async () => {
    expect((await resolve(['qqqqq'])).matches).toEqual([]);
    expect((await resolve(['s', ' ', ''])).matches).toEqual([]);
    const twice = await resolve(['Swiggy', 'swiggy ']);
    expect(new Set(twice.matches.map((m) => m['phrase']))).toEqual(new Set(['swiggy']));
    for (let i = 0; i < 6; i++) await tx({ amount: '10', counterparty_name: `Swiggy Express ${i}` });
    const many = (await resolve(['swiggy'])).matches.filter((m) => m['type'] === 'payee');
    expect(many).toHaveLength(3);
  });

  it('never matches another user\'s payees', async () => {
    await tx({ amount: '10', user_id: OTHER, counterparty_name: 'Hotel Kolkata' });
    expect((await resolve(['kolkata'])).matches).toEqual([]);
    expect((await resolve(['kolkata'], OTHER)).matches[0]).toMatchObject({ type: 'payee', name: 'Hotel Kolkata', txn_count: 1 });
  });

  it('caps the scan at the 400 most used payee names', async () => {
    const stmts = [];
    for (let i = 0; i < 405; i++) {
      stmts.push(
        db()
          .prepare('INSERT INTO transactions (id, user_id, amount, type, transaction_at, counterparty_name, payee_key) VALUES (?, ?, 100, ?, ?, ?, ?)')
          .bind(`aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`, USER_ID, 'debit', at(11), `Filler ${String(i).padStart(3, '0')}`, `filler ${String(i).padStart(3, '0')}`),
      );
    }
    for (let i = 0; i < stmts.length; i += 50) await db().batch(stmts.slice(i, i + 50));
    // The 7 fixture names have 1 to 4 transactions; every filler has 1. Names that fall below the cap are not scored.
    expect((await resolve(['swiggy'])).matches.find((m) => m['id'] === 'swiggy')).toBeDefined(); // heavily used: kept
    expect((await resolve(['filler 404'])).matches.length).toBeLessThanOrEqual(3);
  });
});

describe('find_entities shape', () => {
  it('names the ids for what they are, ranks by score and keeps one row per entity, at most 5', () => {
    const raw = {
      matches: [
        { phrase: 'a', type: 'payee', id: 'swiggy', name: 'Swiggy', score: 0.6, similarity: 0.5, txn_count: 4 },
        { phrase: 'b', type: 'payee', id: 'swiggy', name: 'Swiggy', score: 1, similarity: 1, txn_count: 4 },
        { phrase: 'b', type: 'category', id: 'c1', name: 'Food', score: 0.8, similarity: 0.5 },
        ...Array.from({ length: 6 }, (_, i) => ({ phrase: 'c', type: 'payee', id: `p${i}`, name: `P${i}`, score: 0.5, similarity: 0.1, txn_count: 1 })),
      ],
    };
    const { matches } = shapeEntities(raw);
    expect(matches).toHaveLength(5);
    expect(matches[0]).toEqual({ type: 'payee', payee_key: 'swiggy', name: 'Swiggy', txn_count: 4, score: 1, exact: true });
    expect(matches[1]).toEqual({ type: 'category', category_id: 'c1', name: 'Food', score: 0.8, exact: false });
  });
});

describe('link_target (what a deep link may point at)', () => {
  it('finds a payee of the user by key and uses its oldest named row as the display name', async () => {
    await tx({ amount: '10', counterparty_name: null, counterparty_normalized: 'swiggy', transaction_at: at(1) });
    await tx({ amount: '10', counterparty_name: 'Swiggy', transaction_at: at(2) });
    await tx({ amount: '10', counterparty_name: 'SWIGGY', transaction_at: at(3) });
    expect(await q.link_target(db(), USER_ID, { filter: 'payee', id: 'swiggy' })).toEqual({ name: 'Swiggy' });
  });

  it('refuses a payee that only another user (or only deleted rows) has', async () => {
    await tx({ amount: '10', user_id: OTHER, counterparty_name: 'Hotel Kolkata' });
    await tx({ amount: '10', counterparty_name: 'Gone Shop', deleted_at: '2026-06-02T00:00:00.000Z' });
    expect(await q.link_target(db(), USER_ID, { filter: 'payee', id: 'hotel kolkata' })).toBeNull();
    expect(await q.link_target(db(), USER_ID, { filter: 'payee', id: 'gone shop' })).toBeNull();
    expect(await q.link_target(db(), OTHER, { filter: 'payee', id: 'hotel kolkata' })).toEqual({ name: 'Hotel Kolkata' });
  });

  it('categories: system and own are visible, but never another user categories', async () => {
    const theirs = await seedCategory({ name: 'Secret Dining', user_id: OTHER });
    expect(await q.link_target(db(), USER_ID, { filter: 'category', id: FOOD })).toEqual({ name: 'Dining Out' });
    expect(await q.link_target(db(), USER_ID, { filter: 'category', id: '85bf877a-f8b1-4b07-a9fb-5e8c809907ae' })).toEqual({ name: 'Food & Dining' });
    expect(await q.link_target(db(), USER_ID, { filter: 'category', id: theirs })).toBeNull();
    expect(await q.link_target(db(), USER_ID, { filter: 'category', id: 'nope' })).toBeNull();
  });
});

describe('run_sql default wiring', () => {
  it('runs through the guard for the verified user with the given UTC offset', async () => {
    await tx({ amount: '100.50', transaction_at: '2026-06-10T19:00:00.000Z' });
    await tx({ amount: '999', user_id: OTHER });
    const out = await q.run_sql(db(), USER_ID, { sql: 'SELECT local_date, amount FROM transactions', tzOffsetMinutes: 330 });
    expect(out).toEqual({ ok: true, columns: ['local_date', 'amount'], rows: [['2026-06-11', 100.5]], truncated: false });
    expect(await q.run_sql(db(), USER_ID, { sql: 'DELETE FROM transactions', tzOffsetMinutes: 330 })).toMatchObject({ ok: false });
  });
});
