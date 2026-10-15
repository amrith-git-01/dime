import Constants from "expo-constants";

/**
 * Bump when the shape of any persisted cache entry (React Query blob, notifications and
 * settings snapshots) changes incompatibly. Stored data written under another version is dropped.
 */
export const CACHE_SCHEMA_VERSION = 2;

type CacheBusterParts = {
  appVersion: string | null | undefined;
  /** EAS Update id of the running bundle; absent for the embedded build and in development. */
  updateId: string | null | undefined;
  schemaVersion: number;
};

export function buildCacheBuster(parts: CacheBusterParts): string {
  return [
    parts.appVersion ?? "0",
    parts.updateId ?? "embedded",
    `v${parts.schemaVersion}`,
  ].join("|");
}

/**
 * Identifies the code that wrote the persisted React Query cache. A different app version, OTA
 * update or schema version discards the cache instead of hydrating data the new code cannot read.
 * The update id is skipped in development, where every reload would otherwise wipe the cache.
 */
export const CACHE_BUSTER = buildCacheBuster({
  appVersion: Constants.expoConfig?.version,
  updateId: __DEV__ ? null : Constants.manifest2?.id,
  schemaVersion: CACHE_SCHEMA_VERSION,
});
