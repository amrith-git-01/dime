import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createMMKV } from "react-native-mmkv";

const queryMmkv = createMMKV({ id: "rq-cache" });

/** Threshold at which we warn about cache size approaching the 2 MB guard rail. */
const MMKV_WARN_BYTES = 1_500_000;

const mmkvStorage = {
  getItem: (key: string): string | null => queryMmkv.getString(key) ?? null,
  setItem: (key: string, value: string): void => {
    queryMmkv.set(key, value);
    if (__DEV__) {
      // value.length is UTF-16 code units — a good-enough byte approximation for JSON.
      const kb = (value.length / 1024).toFixed(1);
      if (value.length > MMKV_WARN_BYTES) {
        console.warn(
          `[queryPersister] MMKV cache is large: ${kb} KB — approaching 2 MB guard rail`,
        );
      } else {
        console.log(`[queryPersister] MMKV cache written: ${kb} KB`);
      }
    }
  },
  removeItem: (key: string): void => {
    queryMmkv.remove(key);
  },
};

/** Persists the React Query cache to MMKV so it survives app kills.
 *
 *  - key: namespaced to this app so it never clashes with other MMKV stores
 *  - throttleTime: batches writes at most once per second
 *  - retry: on write error (e.g. storage pressure), evict the oldest query and retry
 */
export const queryPersister = createSyncStoragePersister({
  storage: mmkvStorage,
  key: "dime:rq-cache",
  throttleTime: 1_000,
  retry: removeOldestQuery,
});

/** Wipes the persisted React Query cache from MMKV (call on sign-out). */
export function clearQueryMmkv(): void {
  queryMmkv.clearAll();
}
