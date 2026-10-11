/**
 * A TypeScript port of PostgreSQL's pg_trgm `similarity()` and `word_similarity()` (the agent's fuzzy
 * payee / category matching; D1 has no such function).
 *
 * pg_trgm rules, reproduced here:
 *  - the string is lower-cased and split into words of letters / digits (everything else separates);
 *  - every word is padded with TWO spaces in front and ONE behind ("word" -> "  word "), and each
 *    3-character window of the padded word is a trigram;
 *  - `similarity(a, b)` = |A and B| / |A or B| over the SETS of trigrams (duplicates removed across the
 *    whole string);
 *  - `word_similarity(a, b)` = the best similarity between the trigram SET of `a` and any contiguous
 *    extent of the ORDERED trigram sequence of `b`, where for an extent the union is
 *    |A| + (distinct trigrams in the extent) - (trigrams of A found in the extent);
 *  - results are float4, hence `Math.fround`.
 */

/** Letters and digits of any script; pg_trgm treats these as word characters. */
const WORD_RE = /[\p{L}\p{N}]+/gu;

/** All trigrams of a string in order, per word, without removing duplicates. */
export function trigramSequence(text: string): string[] {
  const out: string[] = [];
  for (const word of text.toLowerCase().match(WORD_RE) ?? []) {
    const padded = Array.from(`  ${word} `);
    for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3).join(''));
  }
  return out;
}

/** The trigram set of a string. */
export function trigramSet(text: string): Set<string> {
  return new Set(trigramSequence(text));
}

/** pg_trgm `similarity(a, b)`. */
export function similarity(a: string, b: string): number {
  return similarityOfSets(trigramSet(a), trigramSet(b));
}

export function similarityOfSets(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return Math.fround(shared / (a.size + b.size - shared));
}

/**
 * pg_trgm `word_similarity(query, target)`: how well `query` appears as a run of words inside `target`.
 * Pass precomputed trigrams to score many targets against one query (or one target against many).
 */
export function wordSimilarity(query: string, target: string): number {
  return wordSimilarityOf(trigramSet(query), trigramSequence(target));
}

export function wordSimilarityOf(query: ReadonlySet<string>, target: readonly string[]): number {
  if (query.size === 0 || target.length === 0) return 0;
  let best = 0;
  // An optimal extent starts and ends on a trigram of the query; anything else only adds to the union.
  for (let start = 0; start < target.length; start++) {
    if (!query.has(target[start] as string)) continue;
    const seen = new Set<string>();
    let found = 0;
    for (let end = start; end < target.length; end++) {
      const trigram = target[end] as string;
      const isQuery = query.has(trigram);
      if (!seen.has(trigram)) {
        seen.add(trigram);
        if (isQuery) found += 1;
      }
      if (isQuery) best = Math.max(best, found / (query.size + seen.size - found));
    }
  }
  return Math.fround(best);
}
