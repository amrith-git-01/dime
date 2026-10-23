import { describe, expect, it } from 'vitest';

import { MemoCache, resetMemoCaches } from '../src/core/memo-cache';

describe('MemoCache', () => {
  it('returns a value until its TTL has passed', () => {
    const cache = new MemoCache<string>(1000, 10);
    cache.set('a', 'A', 0);
    expect(cache.get('a', 999)).toBe('A');
    expect(cache.get('a', 1000)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('drops the least recently used entry past the limit', () => {
    const cache = new MemoCache<number>(1000, 2);
    cache.set('a', 1, 0);
    cache.set('b', 2, 0);
    expect(cache.get('a', 1)).toBe(1); // refreshes a, so b is now the oldest
    cache.set('c', 3, 2);
    expect(cache.get('b', 3)).toBeUndefined();
    expect(cache.get('a', 3)).toBe(1);
    expect(cache.get('c', 3)).toBe(3);
  });

  it('re-setting a key replaces it and restarts its TTL', () => {
    const cache = new MemoCache<number>(1000, 2);
    cache.set('a', 1, 0);
    cache.set('a', 2, 900);
    expect(cache.get('a', 1500)).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('resetMemoCaches empties every cache', () => {
    const one = new MemoCache<number>(1000, 2);
    const two = new MemoCache<number>(1000, 2);
    one.set('a', 1);
    two.set('b', 2);
    resetMemoCaches();
    expect([one.size, two.size]).toEqual([0, 0]);
  });
});
