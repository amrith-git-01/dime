/** How long after the user's own mutation a matching realtime event is treated as an echo. */
export const RECENT_MUTATION_TTL_MS = 5_000;

/**
 * Remembers transaction ids the user just changed so the realtime echo of that same change
 * (the mutation's own `onSuccess` already refreshes the caches) can be skipped.
 */
export function createRecentMutationTracker(
  ttlMs: number = RECENT_MUTATION_TTL_MS,
  now: () => number = Date.now,
) {
  const expiresAtById = new Map<string, number>();

  function prune(): void {
    const current = now();
    for (const [id, expiresAt] of expiresAtById) {
      if (expiresAt <= current) {
        expiresAtById.delete(id);
      }
    }
  }

  return {
    /** Starts (or restarts) the echo window for `id`. */
    mark(id: string): void {
      prune();
      expiresAtById.set(id, now() + ttlMs);
    },
    isRecent(id: string): boolean {
      const expiresAt = expiresAtById.get(id);
      if (expiresAt === undefined) {
        return false;
      }
      if (expiresAt <= now()) {
        expiresAtById.delete(id);
        return false;
      }
      return true;
    },
    clear(): void {
      expiresAtById.clear();
    },
  };
}

/** Shared by the transaction mutations and the realtime subscription. */
export const recentTransactionMutations = createRecentMutationTracker();
