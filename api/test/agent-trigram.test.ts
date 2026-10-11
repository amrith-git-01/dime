import { describe, expect, it } from 'vitest';

import { similarity, trigramSequence, trigramSet, wordSimilarity } from '../src/features/agent/trigram';

/**
 * pg_trgm, by hand. Every expected value below is derived from the algorithm (and the first two are the
 * values the PostgreSQL docs print), so the port is checked against the specification, not against itself.
 *
 * A word is padded with two spaces in front and one behind and cut into 3-character windows:
 *   "word"  -> "  w", " wo", "wor", "ord", "rd "                       (5 trigrams)
 * similarity = shared / (size A + size B - shared) over the trigram SETS.
 * word_similarity = the best of the same formula where B is only an extent (a run of consecutive
 * trigrams) of the target: shared / (size A + distinct trigrams of the extent - shared).
 */
describe('trigram generation', () => {
  it('pads every word with two leading spaces and one trailing space', () => {
    expect(trigramSequence('word')).toEqual(['  w', ' wo', 'wor', 'ord', 'rd ']);
    expect(trigramSequence('two words')).toEqual(['  t', ' tw', 'two', 'wo ', '  w', ' wo', 'wor', 'ord', 'rds', 'ds ']);
  });

  it('lower-cases, splits on anything that is not a letter or digit and removes duplicate trigrams in the set', () => {
    expect([...trigramSet('A-B')]).toEqual([...trigramSet('a b')]);
    expect(trigramSet('aa aa').size).toBe(trigramSet('aa').size); // "  a", " aa", "aa " once
    expect(trigramSequence('aa aa')).toHaveLength(6); // the sequence keeps both words
    expect(trigramSequence('  ---  ')).toEqual([]);
    expect(trigramSet('Rs. 100')).toEqual(new Set(['  r', ' rs', 'rs ', '  1', ' 10', '100', '00 ']));
  });
});

describe('similarity() (shared / union of trigram sets)', () => {
  it('"word" vs "two words" = 4/11 = 0.36363637 (the pg_trgm docs value)', () => {
    // A = {"  w"," wo","wor","ord","rd "} (5); B = {"  t"," tw","two","wo ","  w"," wo","wor","ord","rds","ds "} (10).
    // Shared: "  w", " wo", "wor", "ord" = 4. Union = 5 + 10 - 4 = 11.
    expect(similarity('word', 'two words')).toBeCloseTo(0.36363637, 7);
    expect(similarity('word', 'two words')).toBe(Math.fround(4 / 11));
  });

  it('"swiggy" vs "swiggy instamart" = 7/17', () => {
    // swiggy: "  s"," sw","swi","wig","igg","ggy","gy " = 7. instamart adds "  i"," in","ins","nst","sta","tam","ama","mar","art","rt " = 10.
    // B has 17, shared 7, union = 7 + 17 - 7 = 17.
    expect(similarity('swiggy', 'swiggy instamart')).toBeCloseTo(7 / 17, 6);
  });

  it('a one-letter typo: "swigy" vs "swiggy" = 5/8', () => {
    // swigy: "  s"," sw","swi","wig","igy","gy " = 6; swiggy = 7; shared "  s"," sw","swi","wig","gy " = 5; union = 6 + 7 - 5 = 8.
    expect(similarity('swigy', 'swiggy')).toBeCloseTo(0.625, 6);
  });

  it('is case-blind, symmetric, 1 for the same words and 0 for nothing in common or no words', () => {
    expect(similarity('SWIGGY', 'swiggy')).toBe(1);
    expect(similarity('Cafe Coffee Day', 'cafe  coffee-day')).toBe(1);
    expect(similarity('swigy', 'swiggy')).toBe(similarity('swiggy', 'swigy'));
    expect(similarity('abc', 'xyz')).toBe(0);
    expect(similarity('', 'abc')).toBe(0);
    expect(similarity('!!!', 'abc')).toBe(0);
  });
});

describe('word_similarity() (best extent of the target)', () => {
  it('"word" in "two words" = 0.8 (the pg_trgm docs value)', () => {
    // Target sequence: "  t"," tw","two","wo ","  w"," wo","wor","ord","rds","ds ".
    // Best extent: "  w"," wo","wor","ord" (4 distinct, 4 of them in A). 4 / (5 + 4 - 4) = 0.8.
    // A longer extent adds "rds" ("rd " never appears) and only grows the union: 4 / 6 = 0.67.
    expect(wordSimilarity('word', 'two words')).toBeCloseTo(0.8, 6);
  });

  it('a query that is a whole leading word of the target scores 1', () => {
    // The first 7 trigrams of "swiggy instamart" are exactly A: 7 / (7 + 7 - 7) = 1, while similarity() is only 7/17.
    expect(wordSimilarity('swiggy', 'swiggy instamart')).toBe(1);
    // coffee = "  c"," co","cof","off","ffe","fee","ee " (7), all inside the middle word of "cafe coffee day".
    expect(wordSimilarity('coffee', 'cafe coffee day')).toBe(1);
    expect(similarity('coffee', 'cafe coffee day')).toBeCloseTo(7 / 15, 6); // "  c" is shared by cafe and coffee: 15 distinct, not 16
  });

  it('a typo: "swigy" in "swiggy" = 2/3, better than the whole-string similarity 5/8', () => {
    // A = "  s"," sw","swi","wig","igy","gy " (6). Target "  s"," sw","swi","wig","igg","ggy","gy ".
    // Extent [0..3] = "  s".."wig": 4 found, 4 distinct -> 4 / (6 + 4 - 4) = 2/3. The whole word: 5 found, 7 distinct -> 5 / 8.
    expect(wordSimilarity('swigy', 'swiggy')).toBeCloseTo(2 / 3, 6);
    expect(wordSimilarity('swigy', 'swiggy')).toBeGreaterThan(similarity('swigy', 'swiggy'));
  });

  it('is NOT symmetric: a longer query against a shorter target pays for the missing trigrams', () => {
    // A = "swiggy instamart" (17), target "swiggy" (7 trigrams, all in A): 7 / (17 + 7 - 7) = 7/17.
    expect(wordSimilarity('swiggy instamart', 'swiggy')).toBeCloseTo(7 / 17, 6);
  });

  it('a single trigram match: "ab" in "xab" = 1/3', () => {
    // A = "  a"," ab","ab " (3). Target "  x"," xa","xab","ab ": only "ab " matches (extent of one): 1 / (3 + 1 - 1).
    expect(wordSimilarity('ab', 'xab')).toBeCloseTo(1 / 3, 6);
  });

  it('is 0 without any common trigram or without words', () => {
    expect(wordSimilarity('zzz', 'swiggy')).toBe(0);
    expect(wordSimilarity('', 'swiggy')).toBe(0);
    expect(wordSimilarity('swiggy', '')).toBe(0);
  });

  it('repeated trigrams inside an extent count once in the union', () => {
    // A = "  a"," aa","aa " (3). Target "aa aa" = "  a"," aa","aa ","  a"," aa","aa ". The first three are the best extent: 3/(3+3-3) = 1.
    expect(wordSimilarity('aa', 'aa aa')).toBe(1);
  });
});
