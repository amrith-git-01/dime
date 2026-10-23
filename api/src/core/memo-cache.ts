/**
 * A tiny per-isolate TTL cache for SHARED data only (answers that depend on no user: the brand
 * catalogue). Never put anything user-scoped in here: isolates are reused across users. Entries
 * live for `ttlMs`, the oldest-touched entry is dropped past `maxEntries`, and an isolate recycle
 * simply empties it, so it is a latency / D1-read saver, never a source of truth.
 */
export class MemoCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {
    caches.add(this);
  }

  get(key: string, nowMs: number = Date.now()): V | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= nowMs) {
      this.entries.delete(key);
      return undefined;
    }
    // Re-insert so the Map's iteration order stays least-recently-used first.
    this.entries.delete(key);
    this.entries.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, nowMs: number = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: nowMs + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

const caches = new Set<{ clear(): void }>();

/** Empty every cache (tests reset the database between cases, so cached answers must go too). */
export function resetMemoCaches(): void {
  for (const cache of caches) cache.clear();
}
