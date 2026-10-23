import { describe, expect, it } from 'vitest';

import { resetMemoCaches } from '../src/core/memo-cache';
import { buildMatchExpression } from '../src/features/brands/service';
import { call, makeEnv } from './helpers';
import { oneRow, seedBrand, seedCategory, seedTransaction, seedUser, testDb } from './db';

/** Seeded system categories. */
const FOOD = '85bf877a-f8b1-4b07-a9fb-5e8c809907ae';
const OTHER_USER = '33333333-3333-3333-3333-333333333333';

const noLimit = () => makeEnv({ WRITE_LIMITER: undefined });
const get = <T>(path: string) => call(path).then((r) => r.json<T>());

interface BrandResult {
  items: { id: string; name: string; domain: string | null; logo_url: string | null; category: { id: string; name: string; icon_name: string | null; color: string | null } | null }[];
}
interface Suggestions {
  items: { name: string; brand_id: string | null; domain: string | null; counterparty_type: string; category: { id: string; name: string } | null; count: number; last_at: string }[];
}

const seedCatalogue = async () => {
  await seedBrand({ id: 'wd:swiggy', name: 'Swiggy', popularity: 90, domain: 'swiggy.com', category_id: FOOD, aliases: ['swiggy instamart', 'bundl technologies'] });
  await seedBrand({ id: 'wd:swiss', name: 'Swiss Air', popularity: 10 });
  await seedBrand({ id: 'wd:zomato', name: 'Zomato', popularity: 80, category_id: FOOD });
};

describe('buildMatchExpression', () => {
  it('quotes every normalised word as a prefix term', () => {
    expect(buildMatchExpression('Swiggy')).toBe('"swiggy"*');
    expect(buildMatchExpression("  McDonald's  India ")).toBe('"mcdonald"* "s"* "india"*');
  });

  it('drops FTS syntax and returns null when nothing is searchable', () => {
    expect(buildMatchExpression('swi" OR "x')).toBe('"swi"* "or"* "x"*');
    expect(buildMatchExpression('*()^-')).toBeNull();
    expect(buildMatchExpression('   ')).toBeNull();
  });
});

describe('GET /brands/search', () => {
  it('401 without a token', async () => {
    expect((await call('/api/v1/brands/search?q=sw', { token: false })).status).toBe(401);
    expect((await call('/api/v1/payees/suggestions?type=debit', { token: false })).status).toBe(401);
  });

  it('matches a name prefix, ranks by popularity and returns the category', async () => {
    await seedCatalogue();
    const body = await get<BrandResult>('/api/v1/brands/search?q=Swi');
    expect(body.items.map((i) => i.id)).toEqual(['wd:swiggy', 'wd:swiss']);
    expect(body.items[0]).toEqual({
      id: 'wd:swiggy',
      name: 'Swiggy',
      domain: 'swiggy.com',
      logo_url: null,
      category: { id: FOOD, name: 'Food & Dining', icon_name: expect.any(String) as unknown, color: expect.any(String) as unknown },
    });
    expect(body.items[1]?.category).toBeNull();
  });

  it('finds a brand by one of its aliases, and ANDs several words', async () => {
    await seedCatalogue();
    expect((await get<BrandResult>('/api/v1/brands/search?q=bundl')).items.map((i) => i.id)).toEqual(['wd:swiggy']);
    expect((await get<BrandResult>('/api/v1/brands/search?q=swiggy%20insta')).items.map((i) => i.id)).toEqual(['wd:swiggy']);
    expect((await get<BrandResult>('/api/v1/brands/search?q=swiggy%20zomato')).items).toEqual([]);
  });

  it('honours limit and returns nothing for a query without letters or digits', async () => {
    await seedCatalogue();
    expect((await get<BrandResult>('/api/v1/brands/search?q=s&limit=1')).items).toHaveLength(1);
    expect(await get<BrandResult>('/api/v1/brands/search?q=%22*%22')).toEqual({ items: [] });
  });

  it('answers a repeated search from isolate memory (same normalised query and limit) until the caches are reset', async () => {
    await seedCatalogue();
    expect((await get<BrandResult>('/api/v1/brands/search?q=Swi')).items.map((i) => i.id)).toEqual(['wd:swiggy', 'wd:swiss']);
    await testDb().batch([testDb().prepare('DELETE FROM brands_fts WHERE brand_id = ?').bind('wd:swiss')]);
    // " swi " normalises to the same key: still the cached answer, with the deleted brand in it.
    expect((await get<BrandResult>('/api/v1/brands/search?q=%20swi%20')).items.map((i) => i.id)).toEqual(['wd:swiggy', 'wd:swiss']);
    // A different limit is a different entry, so it sees the database.
    expect((await get<BrandResult>('/api/v1/brands/search?q=swi&limit=5')).items.map((i) => i.id)).toEqual(['wd:swiggy']);
    resetMemoCaches();
    expect((await get<BrandResult>('/api/v1/brands/search?q=swi')).items.map((i) => i.id)).toEqual(['wd:swiggy']);
  });

  it('422 for a missing, blank or oversized q and a bad limit', async () => {
    for (const qs of ['', '?q=', '?q=%20%20', `?q=${'a'.repeat(61)}`, '?q=a&limit=0', '?q=a&limit=21', '?q=a&limit=x']) {
      expect((await call(`/api/v1/brands/search${qs}`)).status, qs).toBe(422);
    }
  });
});

describe('GET /payees/suggestions', () => {
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const suggestions = (qs: string) => get<Suggestions>(`/api/v1/payees/suggestions?${qs}`);

  it('422 without a valid type or with a bad limit', async () => {
    for (const qs of ['', 'type=nope', 'type=debit&limit=0', 'type=debit&limit=21']) {
      expect((await call(`/api/v1/payees/suggestions?${qs}`)).status, qs).toBe(422);
    }
  });

  it('is scoped to the caller and splits debit from credit', async () => {
    await seedUser(OTHER_USER);
    await seedTransaction({ counterparty_name: 'Cafe', type: 'debit', transaction_at: at(1) });
    await seedTransaction({ counterparty_name: 'Acme', type: 'credit', transaction_at: at(1) });
    await seedTransaction({ counterparty_name: 'Stranger Shop', type: 'debit', user_id: OTHER_USER, transaction_at: at(1) });
    await seedTransaction({ counterparty_name: 'Deleted Shop', type: 'debit', deleted_at: at(0), transaction_at: at(1) });
    expect((await suggestions('type=debit')).items.map((i) => i.name)).toEqual(['Cafe']);
    expect((await suggestions('type=credit')).items.map((i) => i.name)).toEqual(['Acme']);
  });

  it('groups spellings of one brand and shows the brand name and domain', async () => {
    await seedBrand({ id: 'wd:swiggy', name: 'Swiggy', domain: 'swiggy.com', category_id: FOOD });
    await seedTransaction({ counterparty_name: 'SWIGGY*BLR', brand_id: 'wd:swiggy', transaction_at: at(3) });
    await seedTransaction({ counterparty_name: 'Swiggy Instamart', brand_id: 'wd:swiggy', transaction_at: at(2) });
    await seedTransaction({ counterparty_name: 'Swiggy', brand_id: 'wd:swiggy', transaction_at: at(1) });
    await seedTransaction({ counterparty_name: 'Local Cafe', transaction_at: at(1) });
    const body = await suggestions('type=debit');
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ name: 'Swiggy', brand_id: 'wd:swiggy', domain: 'swiggy.com', count: 3, counterparty_type: 'merchant' });
    expect(body.items[1]).toMatchObject({ name: 'Local Cafe', brand_id: null, domain: null, count: 1 });
  });

  it('ranks by frequency with recent use counting double, then by recency', async () => {
    // Old: 3 uses = 3 points. Recent: 2 uses = 4 points. Single recent use = 2 points, newer than the other single.
    for (const d of [200, 210, 220]) await seedTransaction({ counterparty_name: 'Old Favourite', transaction_at: at(d) });
    for (const d of [5, 6]) await seedTransaction({ counterparty_name: 'Recent Pair', transaction_at: at(d) });
    await seedTransaction({ counterparty_name: 'Once Older', transaction_at: at(20) });
    await seedTransaction({ counterparty_name: 'Once Newer', transaction_at: at(2) });
    expect((await suggestions('type=debit')).items.map((i) => i.name)).toEqual(['Recent Pair', 'Old Favourite', 'Once Newer', 'Once Older']);
    expect((await suggestions('type=debit&limit=2')).items).toHaveLength(2);
  });

  it('uses the most recent name, type and category of a payee', async () => {
    const mine = await seedCategory({ name: 'Snacks', icon_name: 'Cookie' });
    await seedTransaction({ counterparty_name: 'ravi', counterparty_normalized: 'ravi', counterparty_type: 'merchant', category_id: FOOD, transaction_at: at(10) });
    await seedTransaction({ counterparty_name: 'Ravi', counterparty_normalized: 'ravi', counterparty_type: 'person', category_id: mine, transaction_at: at(5) });
    await seedTransaction({ counterparty_name: 'RAVI', counterparty_normalized: 'ravi', counterparty_type: 'person', category_id: null, transaction_at: at(1) });
    const [item] = (await suggestions('type=debit')).items;
    expect(item).toMatchObject({ name: 'RAVI', counterparty_type: 'person', count: 3, category: { id: mine, name: 'Snacks' } });
  });

  it("filters by prefix of the payee or of any word in it, and leaves out 'unknown'", async () => {
    await seedBrand({ id: 'wd:mcd', name: "McDonald's" });
    await seedTransaction({ counterparty_name: 'Blue Bottle Coffee', transaction_at: at(1) });
    await seedTransaction({ counterparty_name: 'Bluestone', transaction_at: at(2) });
    await seedTransaction({ counterparty_name: 'MCD*DELHI', brand_id: 'wd:mcd', transaction_at: at(3) });
    await seedTransaction({ counterparty_name: '', counterparty_normalized: null, transaction_at: at(1) });
    expect((await suggestions('type=debit')).items.map((i) => i.name)).toEqual(['Blue Bottle Coffee', 'Bluestone', "McDonald's"]);
    expect((await suggestions('type=debit&q=blue')).items.map((i) => i.name)).toEqual(['Blue Bottle Coffee', 'Bluestone']);
    expect((await suggestions('type=debit&q=coff')).items.map((i) => i.name)).toEqual(['Blue Bottle Coffee']);
    expect((await suggestions('type=debit&q=ottle')).items).toEqual([]);
    expect((await suggestions('type=debit&q=mcdon')).items.map((i) => i.name)).toEqual(["McDonald's"]);
    expect((await suggestions('type=debit&q=100%25')).items).toEqual([]);
  });
});

describe('transactions link to brands', () => {
  const create = (over: Record<string, unknown> = {}) =>
    call('/api/v1/transactions?timezone=UTC', {
      method: 'POST',
      env: noLimit(),
      json: { amount: '120', type: 'debit', counterparty_name: 'Swiggy', transaction_at: '2026-10-04T10:00:00Z', ...over },
    });
  const brandOf = async (name: string) => (await oneRow<{ brand_id: string | null }>('transactions', 'counterparty_name = ?', name))?.brand_id;

  it('resolves the brand from the payee name through the alias table', async () => {
    await seedCatalogue();
    expect((await create({ counterparty_name: 'SWIGGY Instamart' })).status).toBe(201);
    expect(await brandOf('SWIGGY Instamart')).toBe('wd:swiggy');
    expect((await create({ counterparty_name: 'Corner Shop' })).status).toBe(201);
    expect(await brandOf('Corner Shop')).toBeNull();
  });

  it('keeps an explicit brand_id, even when the typed name differs', async () => {
    await seedCatalogue();
    await create({ counterparty_name: 'My zomato order', brand_id: 'wd:zomato' });
    expect(await brandOf('My zomato order')).toBe('wd:zomato');
  });

  it('ignores an unknown brand_id and resolves from the name instead', async () => {
    await seedCatalogue();
    await create({ brand_id: 'wd:nope' });
    expect(await brandOf('Swiggy')).toBe('wd:swiggy');
    await create({ counterparty_name: 'Elsewhere', brand_id: 'wd:nope' });
    expect(await brandOf('Elsewhere')).toBeNull();
  });

  it('does not link people or own-account transfers by name', async () => {
    await seedCatalogue();
    await create({ counterparty_type: 'person' });
    expect(await brandOf('Swiggy')).toBeNull();
    await create({ counterparty_type: 'self_transfer', amount: '121' });
    expect((await oneRow<{ brand_id: string | null }>('transactions', 'amount = 12100'))?.brand_id).toBeNull();
  });

  it('returns brand_id on the transaction responses', async () => {
    await seedCatalogue();
    const { id } = await (await create()).json<{ id: string }>();
    expect((await get<{ brand_id: string | null }>(`/api/v1/transactions/${id}`)).brand_id).toBe('wd:swiggy');
    const list = await get<{ items: { brand_id: string | null }[] }>('/api/v1/transactions');
    expect(list.items[0]?.brand_id).toBe('wd:swiggy');
  });

  describe('update', () => {
    const TX = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const patch = (over: Record<string, unknown> = {}) =>
      call(`/api/v1/transactions/${TX}`, {
        method: 'PATCH',
        env: noLimit(),
        json: { amount: '100', type: 'debit', counterparty_name: 'Swiggy', transaction_at: '2026-10-04T10:00:00Z', ...over },
      });
    const stored = () => oneRow<{ brand_id: string | null }>('transactions', 'id = ?', TX);

    it('re-resolves when the name changes and keeps the link when it does not', async () => {
      await seedCatalogue();
      await seedTransaction({ id: TX, counterparty_name: 'Corner Shop', transaction_at: '2026-10-04T10:00:00.000Z' });
      expect((await patch({ counterparty_name: 'Zomato' })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:zomato');
      expect((await patch({ counterparty_name: 'Zomato', note: 'again' })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:zomato');
      expect((await patch({ counterparty_name: 'Corner Shop' })).status).toBe(200);
      expect((await stored())?.brand_id).toBeNull();
    });

    it('re-resolves when only the counterparty type changes', async () => {
      await seedCatalogue();
      await seedTransaction({ id: TX, counterparty_name: 'Swiggy', counterparty_type: 'person', transaction_at: '2026-10-04T10:00:00.000Z' });
      expect((await stored())?.brand_id).toBeNull();
      expect((await patch({ counterparty_type: 'merchant' })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:swiggy');
    });

    it('an explicit brand_id wins; null or an unknown id re-resolves from the name', async () => {
      await seedCatalogue();
      await seedTransaction({ id: TX, counterparty_name: 'Swiggy', brand_id: 'wd:swiggy', transaction_at: '2026-10-04T10:00:00.000Z' });
      expect((await patch({ brand_id: 'wd:zomato' })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:zomato');
      // The app sends null for a typed name (e.g. "Swiggyx" edited back to "Swiggy"): the name still matches.
      expect((await patch({ brand_id: null })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:swiggy');
      expect((await patch({ brand_id: 'wd:nope' })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:swiggy');
    });

    it('a person is never linked, even with a picked brand', async () => {
      await seedCatalogue();
      await seedTransaction({ id: TX, counterparty_name: 'Swiggy', brand_id: 'wd:swiggy', transaction_at: '2026-10-04T10:00:00.000Z' });
      expect((await patch({ counterparty_type: 'person', brand_id: 'wd:swiggy' })).status).toBe(200);
      expect((await stored())?.brand_id).toBeNull();
    });

    it('a null sent with a changed name re-resolves from the new name (the app sends null for typed names)', async () => {
      await seedCatalogue();
      await seedTransaction({ id: TX, counterparty_name: 'Corner Shop', transaction_at: '2026-10-04T10:00:00.000Z' });
      expect((await patch({ counterparty_name: 'Zomato', brand_id: null })).status).toBe(200);
      expect((await stored())?.brand_id).toBe('wd:zomato');
    });
  });
});
