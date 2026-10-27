/**
 * Bump when the shape of what `reportsApi` returns (list rows, snapshot) changes incompatibly. It
 * is part of the keys, so entries persisted under the old shape are never read again (they age
 * out with the cache). The persisted blob is also dropped on every app version / OTA update
 * (`CACHE_BUSTER`); this guards a shape change that ships within one update.
 */
export const REPORT_CACHE_SHAPE = 1;

export const reportQueryKeys = {
  all: ["reports"] as const,
  list: (userId: string | undefined) =>
    [...reportQueryKeys.all, `list.v${REPORT_CACHE_SHAPE}`, userId ?? "none"] as const,
  period: (userId: string | undefined, periodKey: string) =>
    [
      ...reportQueryKeys.all,
      `period.v${REPORT_CACHE_SHAPE}`,
      userId ?? "none",
      periodKey,
    ] as const,
};
