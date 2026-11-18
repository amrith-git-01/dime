/** How long after the user's own mutation a matching realtime event is treated as an echo. */
export const RECENT_MUTATION_TTL_MS = 5_000;

type Mark = {
  expiresAt: number;
  /** The `updated_at` the server gave this device's own write; null when it did not say (a delete). */
  updatedAt: string | null;
};

function sameInstant(a: string, b: string): boolean {
  const left = Date.parse(a);
  const right = Date.parse(b);
  return Number.isNaN(left) || Number.isNaN(right) ? a === b : left === right;
}

/**
 * Remembers transaction writes the user just made so the realtime echo of that same change (the mutation's
 * own `onSuccess` already refreshed the caches) can be skipped.
 *
 * An echo is the event of THAT write: it carries the same `updated_at` the server returned to this device. An
 * event for the same row with another `updated_at` is somebody else's change (another device edited it a second
 * later) and must be applied, never dropped because this device touched the row moments ago.
 */
export function createRecentMutationTracker(
  ttlMs: number = RECENT_MUTATION_TTL_MS,
  now: () => number = Date.now,
) {
  const marksById = new Map<string, Mark>();

  function prune(): void {
    const current = now();
    for (const [id, mark] of marksById) {
      if (mark.expiresAt <= current) {
        marksById.delete(id);
      }
    }
  }

  function live(id: string): Mark | null {
    const mark = marksById.get(id);
    if (mark === undefined) {
      return null;
    }
    if (mark.expiresAt <= now()) {
      marksById.delete(id);
      return null;
    }
    return mark;
  }

  return {
    /** Starts (or restarts) the echo window for `id`; `updatedAt` is the server's answer to this device's write. */
    mark(id: string, updatedAt?: string | null): void {
      prune();
      marksById.set(id, { expiresAt: now() + ttlMs, updatedAt: updatedAt ?? null });
    },
    /** Whether `id` was written by this device within the window (whatever the event says). */
    isRecent(id: string): boolean {
      return live(id) !== null;
    },
    /**
     * Whether a realtime event is the echo of this device's own write. With a recorded `updated_at` only an
     * event carrying the same one is. Without one (a delete: the server answers 204) only an event that removes
     * the row is (`removal`: a DELETE frame, or an UPDATE with `deleted_at` set).
     */
    isEcho(id: string, event: { updatedAt?: string | null; removal?: boolean }): boolean {
      const mark = live(id);
      if (mark === null) {
        return false;
      }
      if (mark.updatedAt === null) {
        return event.removal === true;
      }
      return event.updatedAt != null && sameInstant(mark.updatedAt, event.updatedAt);
    },
    clear(): void {
      marksById.clear();
    },
  };
}

/** Shared by the transaction mutations and the realtime subscription. */
export const recentTransactionMutations = createRecentMutationTracker();
