import { randomUUID } from "expo-crypto";

/**
 * Hands out one `Idempotency-Key` per distinct payload. Retrying the same payload reuses its
 * key (so a request that reached the server is not duplicated); a changed payload gets a new one.
 */
export function createIdempotencyKeyCache() {
  let last: { fingerprint: string; key: string } | null = null;

  return {
    keyFor(payload: unknown): string {
      const fingerprint = JSON.stringify(payload);
      if (last?.fingerprint !== fingerprint) {
        last = { fingerprint, key: randomUUID() };
      }
      return last.key;
    },
    /** Call after a successful submit so the next identical entry is a new transaction. */
    clear(): void {
      last = null;
    },
  };
}
