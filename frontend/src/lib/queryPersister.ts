import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { hydrate, type QueryClient } from "@tanstack/react-query";
import {
  removeOldestQuery,
  type PersistedClient,
} from "@tanstack/react-query-persist-client";
import { createMMKV } from "react-native-mmkv";

import { CACHE_BUSTER } from "@/lib/cacheVersion";
import {
  serializePersistedClient,
  shouldDehydrateQuery,
} from "@/lib/queryCachePolicy";
import { reportError } from "@/lib/reportError";

const queryMmkv = createMMKV({ id: "rq-cache" });

export const QUERY_CACHE_KEY = "dime:rq-cache";
export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const mmkvStorage = {
  getItem: (key: string): string | null => queryMmkv.getString(key) ?? null,
  setItem: (key: string, value: string): void => {
    queryMmkv.set(key, value);
  },
  removeItem: (key: string): void => {
    queryMmkv.remove(key);
  },
};

/** Persists the React Query cache to MMKV so it survives app kills.
 *
 *  - key: namespaced to this app so it never clashes with other MMKV stores
 *  - serialize: trims the cache and enforces the size budget (see queryCachePolicy)
 *  - throttleTime: batches writes at most once per second
 *  - retry: on write error (e.g. storage pressure), evict the oldest query and retry
 */
export const queryPersister = createSyncStoragePersister({
  storage: mmkvStorage,
  key: QUERY_CACHE_KEY,
  serialize: serializePersistedClient,
  throttleTime: 1_000,
  retry: removeOldestQuery,
});

/** Whether a persisted React Query blob exists in MMKV (sync). */
export function hasPersistedQueryCache(): boolean {
  return queryMmkv.contains(QUERY_CACHE_KEY);
}

/** Wipes the persisted React Query cache from MMKV (call on sign-out). */
export function clearQueryMmkv(): void {
  queryMmkv.clearAll();
}

/** Options shared by `persistQueryClientSubscribe` (writes) and `restoreQueryCache` (reads). */
export const appQueryPersistOptions = {
  persister: queryPersister,
  maxAge: QUERY_CACHE_MAX_AGE_MS,
  buster: CACHE_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery },
} as const;

/**
 * Hydrates the persisted React Query blob into `queryClient`. A blob that is expired, was written
 * by another app version / update / schema (buster mismatch) or cannot be read is discarded.
 */
export function restoreQueryCache(queryClient: QueryClient): boolean {
  try {
    const persisted = queryPersister.restoreClient() as
      | PersistedClient
      | undefined;

    if (!persisted?.timestamp) {
      return false;
    }

    if (
      persisted.buster !== CACHE_BUSTER ||
      Date.now() - persisted.timestamp > QUERY_CACHE_MAX_AGE_MS
    ) {
      queryPersister.removeClient();
      return false;
    }

    hydrate(queryClient, persisted.clientState);
    return true;
  } catch (error) {
    reportError(
      error,
      "queryPersister corrupt or incompatible query cache, clearing MMKV",
    );
    queryPersister.removeClient();
    return false;
  }
}
