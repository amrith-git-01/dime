import type { Failure } from "./failure";
import type { OutboxItem } from "./outboxTypes";

/**
 * Pure rules of the outbox (no storage, no network, time injected) so they can be tested to the
 * letter: how long to wait between tries, when an item is given up on, what a failure turns an
 * item into.
 */

/** Waits before the 2nd, 3rd, ... try; the last value repeats. */
export const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 120_000, 300_000] as const;

/** Matches the server's idempotency window (`MANUAL_CREATE_RETENTION_DAYS`) and its `captured_at` limit. */
export const MAX_ITEM_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** The tour / limits reset on the server happens at 00:00 UTC; allow a minute of clock slack. */
const LIMIT_RESET_SLACK_MS = 60_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export const TOO_OLD_MESSAGE = "Too old to sync";

/** `attempts` = tries already made (1 after the first failure). */
export function backoffDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1;
  return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
}

/**
 * Age counts from the earlier of when the entry was queued and when it was captured: the server
 * refuses a `captured_at` older than 30 days, so a capture that sat on the device longer than that
 * can never be accepted.
 */
export function isTooOld(
  item: Pick<OutboxItem, "createdAt"> & Partial<Pick<OutboxItem, "capturedAt">>,
  now: number,
): boolean {
  const captured = item.capturedAt ? Date.parse(item.capturedAt) : Number.NaN;
  const start = Number.isNaN(captured) ? item.createdAt : Math.min(item.createdAt, captured);
  return now - start > MAX_ITEM_AGE_MS;
}

/** Next 00:00 UTC strictly after `now`: when the server's daily capture counters reset. */
export function nextUtcMidnight(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
}

/**
 * When a blocked capture may try again: the server's `Retry-After` when it sent one, else the
 * next reset. (The daily counters are per UTC day on the server, so this is not the local midnight.)
 */
export function limitResetAt(now: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
    return now + retryAfterSeconds * 1000 + LIMIT_RESET_SLACK_MS;
  }
  return nextUtcMidnight(now) + LIMIT_RESET_SLACK_MS;
}

/** Whether the drain may try this item now. `failed` waits for the user; `sending` is in flight. */
export function isDue(item: OutboxItem, now: number): boolean {
  if (item.status === "failed" || item.status === "sending") {
    return false;
  }
  return item.nextAttemptAt === null || item.nextAttemptAt <= now;
}

/** The earliest moment an automatic retry becomes due (null when nothing is waiting on a timer). */
export function earliestAttemptAt(items: readonly OutboxItem[]): number | null {
  let earliest: number | null = null;
  for (const item of items) {
    if (item.status === "failed" || item.status === "sending") {
      continue;
    }
    const at = item.nextAttemptAt ?? 0;
    if (earliest === null || at < earliest) {
      earliest = at;
    }
  }
  return earliest;
}

/** The item after an attempt that failed with `failure`. */
export function itemAfterFailure(
  item: OutboxItem,
  failure: Failure,
  now: number,
): OutboxItem {
  const attempts = item.attempts + 1;
  if (isTooOld(item, now)) {
    return {
      ...item,
      attempts,
      status: "failed",
      nextAttemptAt: null,
      lastError: TOO_OLD_MESSAGE,
    };
  }
  switch (failure.kind) {
    case "retry":
      return {
        ...item,
        attempts,
        status: "queued",
        nextAttemptAt: now + Math.max(
          backoffDelayMs(attempts),
          // A 429 / 503 that names a wait is honoured when it is longer than our own step.
          failure.retryAfterSeconds ? failure.retryAfterSeconds * 1000 : 0,
        ),
        lastError: failure.message,
      };
    case "limit":
      return {
        ...item,
        attempts,
        status: "blocked",
        nextAttemptAt: limitResetAt(now, failure.retryAfterSeconds),
        lastError: failure.message,
      };
    case "fatal":
      return {
        ...item,
        attempts,
        status: "failed",
        nextAttemptAt: null,
        lastError: failure.message,
      };
  }
}

/** Retry pressed on a failed / blocked item: back in the line, immediately, with a clean slate. */
export function itemForManualRetry(item: OutboxItem): OutboxItem {
  const { lastError: _lastError, ...rest } = item;
  return { ...rest, status: "queued", attempts: 0, nextAttemptAt: null };
}

/**
 * After the server could not be reached, the rest of the line would fail the same way: give every
 * other waiting item the same wait instead of hammering a dead connection one by one.
 */
export function deferUntil(item: OutboxItem, at: number): OutboxItem {
  return { ...item, nextAttemptAt: Math.max(item.nextAttemptAt ?? 0, at) };
}
