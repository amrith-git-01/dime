import { batch } from '../../core/db';
import type { Db } from '../../core/db';
import { similarityOfSets, trigramSequence, trigramSet, wordSimilarityOf } from './trigram';

/**
 * Fuzzy payee / category lookup (pg_trgm similarity in TypeScript, see `trigram.ts`): the pre-pass uses it
 * for every question and the model calls it as `find_entities`. Every statement binds the verified user id.
 */

type Doc = Record<string, unknown>;

/** Visible to the user: system categories and their own. */
const VISIBLE_CATEGORY = '(c.is_system = 1 OR c.user_id = ?)';

/** Word-similarity cut-off, lowered to 0.4 (from pg_trgm's 0.6 default) so typos survive. */
const MATCH_THRESHOLD = Math.fround(0.4);
const MAX_PHRASES = 8;
const PER_TYPE = 3;
/**
 * ponytail: only the 400 most used (payee_key, name) pairs are scored, so CPU stays bounded for users with
 * thousands of one-off payees. A payee outside the top 400 can only be found by SQL on counterparty_name;
 * revisit with an FTS5 table if that ever shows up.
 */
const PAYEE_SCAN_LIMIT = 400;

interface PayeeCandidate {
  key: string;
  name: string;
  n: number;
  trigrams: string[];
  set: Set<string>;
}

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

export async function resolveEntities(db: Db, userId: string, p: { phrases: readonly string[] }): Promise<Doc> {
  const phrases = [...new Set(p.phrases.map((x) => x.trim().toLowerCase()).filter((x) => Array.from(x).length >= 2))].slice(0, MAX_PHRASES);
  if (phrases.length === 0) return { matches: [] };

  const [payeeRows, categoryRows] = await batch<Record<string, unknown>>(db, [
    db
      .prepare(
        `SELECT payee_key AS key, counterparty_name AS name, COUNT(*) AS n FROM transactions
         WHERE user_id = ? AND deleted_at IS NULL AND counterparty_name IS NOT NULL
         GROUP BY payee_key, counterparty_name ORDER BY n DESC, payee_key LIMIT ?`,
      )
      .bind(userId, PAYEE_SCAN_LIMIT),
    db.prepare(`SELECT c.id, c.name FROM categories c WHERE ${VISIBLE_CATEGORY}`).bind(userId),
  ]);

  const payees: PayeeCandidate[] = (payeeRows ?? []).map((r) => {
    const name = String(r['name']);
    const trigrams = trigramSequence(name);
    return { key: String(r['key']), name, n: Number(r['n']), trigrams, set: new Set(trigrams) };
  });
  const categories = (categoryRows ?? []).map((r) => {
    const name = String(r['name']);
    const trigrams = trigramSequence(name);
    return { id: String(r['id']), name, trigrams, set: new Set(trigrams) };
  });

  interface Hit {
    phrase: string;
    type: 'payee' | 'category';
    id: string;
    name: string;
    ws: number;
    sim: number;
    n: number;
  }
  const hits: Hit[] = [];

  for (const phrase of phrases) {
    const q = trigramSet(phrase);

    // Payees: rows below the threshold are dropped BEFORE grouping (like `phrase <% name` in the WHERE).
    const groups = new Map<string, { ws: number; sim: number; n: number; names: Map<string, number> }>();
    for (const c of payees) {
      const ws = wordSimilarityOf(q, c.trigrams);
      if (ws < MATCH_THRESHOLD) continue;
      const g = groups.get(c.key) ?? { ws: 0, sim: 0, n: 0, names: new Map<string, number>() };
      g.ws = Math.max(g.ws, ws);
      g.sim = Math.max(g.sim, similarityOfSets(q, c.set));
      g.n += c.n;
      g.names.set(c.name, (g.names.get(c.name) ?? 0) + c.n);
      groups.set(c.key, g);
    }
    const payeeHits: Hit[] = [...groups].map(([key, g]) => {
      // mode(): the most frequent name, the smallest on a tie.
      const name = [...g.names].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ?? '';
      return { phrase, type: 'payee', id: key, name, ws: g.ws, sim: g.sim, n: g.n };
    });
    payeeHits.sort((a, b) => b.ws - a.ws || b.sim - a.sim || b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    hits.push(...payeeHits.slice(0, PER_TYPE));

    const categoryHits: Hit[] = [];
    for (const c of categories) {
      const ws = wordSimilarityOf(q, c.trigrams);
      if (ws < MATCH_THRESHOLD) continue;
      categoryHits.push({ phrase, type: 'category', id: c.id, name: c.name, ws, sim: similarityOfSets(q, c.set), n: 0 });
    }
    categoryHits.sort((a, b) => b.ws - a.ws || b.sim - a.sim || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    hits.push(...categoryHits.slice(0, PER_TYPE));
  }

  hits.sort((a, b) => b.ws - a.ws || b.sim - a.sim || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    matches: hits.map((h) => ({ phrase: h.phrase, type: h.type, id: h.id, name: h.name, score: round3(h.ws), similarity: round3(h.sim), txn_count: h.n })),
  };
}

export interface EntityMatch {
  phrase: string;
  type: 'payee' | 'category';
  /** payee key, or category uuid. */
  id: string;
  name: string;
  /** word_similarity: how well the phrase appears inside the name. */
  score: number;
  /** similarity: closeness of the whole strings (1 = the same name). */
  similarity: number;
  txnCount: number;
}

const obj = (raw: unknown): Record<string, unknown> => (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});

export function parseEntityMatches(raw: unknown): EntityMatch[] {
  const matches = obj(raw)['matches'];
  if (!Array.isArray(matches)) return [];
  const out: EntityMatch[] = [];
  for (const item of matches) {
    const m = obj(item);
    if ((m['type'] !== 'payee' && m['type'] !== 'category') || typeof m['id'] !== 'string' || typeof m['name'] !== 'string') continue;
    out.push({
      phrase: typeof m['phrase'] === 'string' ? m['phrase'] : '',
      type: m['type'],
      id: m['id'],
      name: m['name'],
      score: Number(m['score']) || 0,
      similarity: Number(m['similarity']) || 0,
      txnCount: Number(m['txn_count']) || 0,
    });
  }
  return out;
}

/** The `find_entities` result: up to 5 entities, best match first, one row per entity, ids named for what they are. */
export function shapeEntities(raw: unknown): { matches: Record<string, unknown>[] } {
  const best = new Map<string, EntityMatch>();
  for (const m of parseEntityMatches(raw)) {
    const key = `${m.type}:${m.id}`;
    const cur = best.get(key);
    if (!cur || m.score > cur.score) best.set(key, m);
  }
  const matches = [...best.values()]
    .sort((x, y) => y.score - x.score || y.similarity - x.similarity)
    .slice(0, 5)
    .map((m) =>
      m.type === 'payee'
        ? { type: 'payee', payee_key: m.id, name: m.name, txn_count: m.txnCount, score: m.score, exact: m.similarity >= 0.95 }
        : { type: 'category', category_id: m.id, name: m.name, score: m.score, exact: m.similarity >= 0.95 },
    );
  return { matches };
}
