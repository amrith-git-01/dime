import type { InternalAxiosRequestConfig } from "axios";

/**
 * In-memory validators for conditional GETs. Memory only, never disk: the persisted rq-cache restores
 * the screens' data at launch but not the URL bodies, so the first fetch of each URL after a cold
 * start is a full 200; every later revalidation (focus, invalidation, realtime, resume) answers 304
 * and costs only headers. The map is bounded and the oldest entry goes first.
 */
export const ETAG_CACHE_MAX_ENTRIES = 150;

export type EtagEntry = { etag: string; data: unknown };

export function createEtagCache(maxEntries: number = ETAG_CACHE_MAX_ENTRIES) {
  const entries = new Map<string, EtagEntry>();

  return {
    get(key: string): EtagEntry | undefined {
      const hit = entries.get(key);
      if (!hit) {
        return undefined;
      }
      // Re-insert so iteration order stays least-recently-used first.
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    },
    set(key: string, entry: EtagEntry): void {
      entries.delete(key);
      entries.set(key, entry);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) {
          break;
        }
        entries.delete(oldest.value);
      }
    },
    delete(key: string): void {
      entries.delete(key);
    },
    clear(): void {
      entries.clear();
    },
    get size(): number {
      return entries.size;
    },
  };
}

/** Shared by `dimeApi`; cleared on sign-out / user switch and by "Clear offline cache". */
export const etagCache = createEtagCache();

type ParamValue = string | number | boolean | null | undefined;

function paramPairs(params: unknown): [string, string][] {
  if (!params) {
    return [];
  }
  if (typeof URLSearchParams !== "undefined" && params instanceof URLSearchParams) {
    return [...params.entries()];
  }
  const pairs: [string, string][] = [];
  for (const [name, raw] of Object.entries(params as Record<string, unknown>)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values as ParamValue[]) {
      if (value !== undefined && value !== null) {
        pairs.push([name, String(value)]);
      }
    }
  }
  return pairs;
}

/** Full request URL (base + path + params sorted by name) so equal requests share one entry. */
export function etagKeyFor(
  config: Pick<InternalAxiosRequestConfig, "baseURL" | "url" | "params">,
): string {
  const pairs = paramPairs(config.params).sort(
    ([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)),
  );
  const query = pairs
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const base = `${config.baseURL ?? ""}${config.url ?? ""}`;
  return query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
}
