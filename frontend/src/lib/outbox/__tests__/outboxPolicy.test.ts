import type { Failure } from "../failure";
import {
  BACKOFF_MS,
  backoffDelayMs,
  deferUntil,
  earliestAttemptAt,
  isDue,
  isTooOld,
  itemAfterFailure,
  itemForManualRetry,
  limitResetAt,
  MAX_ITEM_AGE_MS,
  nextUtcMidnight,
  TOO_OLD_MESSAGE,
} from "../outboxPolicy";
import { manualItem, NOW, voiceItem } from "./fixtures";

const retry: Failure = { kind: "retry", message: "offline", offline: true };

describe("backoffDelayMs", () => {
  it("steps 5 s, 15 s, 30 s, 60 s, 2 min, then holds at 5 min", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(backoffDelayMs)).toEqual([
      5_000, 15_000, 30_000, 60_000, 120_000, 300_000, 300_000, 300_000,
    ]);
    expect(BACKOFF_MS[BACKOFF_MS.length - 1]).toBe(300_000);
  });

  it("treats 0 or negative attempts as the first step", () => {
    expect(backoffDelayMs(0)).toBe(5_000);
    expect(backoffDelayMs(-3)).toBe(5_000);
  });
});

describe("isTooOld", () => {
  it("is true only past 30 days", () => {
    expect(isTooOld({ createdAt: NOW - MAX_ITEM_AGE_MS }, NOW)).toBe(false);
    expect(isTooOld({ createdAt: NOW - MAX_ITEM_AGE_MS - 1 }, NOW)).toBe(true);
  });

  it("counts from the capture time when that is earlier than the queueing (the server refuses an old captured_at)", () => {
    const captured = new Date(NOW - MAX_ITEM_AGE_MS - 1).toISOString();
    expect(isTooOld({ createdAt: NOW - 1000, capturedAt: captured }, NOW)).toBe(true);
    expect(isTooOld({ createdAt: NOW - 1000, capturedAt: new Date(NOW - 5000).toISOString() }, NOW)).toBe(false);
    expect(isTooOld({ createdAt: NOW - 1000, capturedAt: "not a date" }, NOW)).toBe(false);
  });
});

describe("limit reset", () => {
  it("nextUtcMidnight is the next 00:00 UTC, strictly after now", () => {
    expect(new Date(nextUtcMidnight(Date.parse("2026-10-23T10:00:00Z"))).toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(new Date(nextUtcMidnight(Date.parse("2026-10-23T00:00:00Z"))).toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(new Date(nextUtcMidnight(Date.parse("2026-10-23T23:59:59Z"))).toISOString()).toBe("2026-10-24T00:00:00.000Z");
  });

  it("uses the server's Retry-After when given, with a minute of slack", () => {
    expect(limitResetAt(NOW, 3600)).toBe(NOW + 3_600_000 + 60_000);
  });

  it("falls back to the next UTC midnight (plus slack) without one", () => {
    expect(limitResetAt(NOW)).toBe(nextUtcMidnight(NOW) + 60_000);
    expect(limitResetAt(NOW, 0)).toBe(nextUtcMidnight(NOW) + 60_000);
  });
});

describe("isDue and earliestAttemptAt", () => {
  it("queued and blocked items are due once their time has come; failed and sending never", () => {
    expect(isDue(manualItem({ nextAttemptAt: null }), NOW)).toBe(true);
    expect(isDue(manualItem({ nextAttemptAt: NOW }), NOW)).toBe(true);
    expect(isDue(manualItem({ nextAttemptAt: NOW + 1 }), NOW)).toBe(false);
    expect(isDue(manualItem({ status: "blocked", nextAttemptAt: NOW - 1 }), NOW)).toBe(true);
    expect(isDue(manualItem({ status: "failed" }), NOW)).toBe(false);
    expect(isDue(manualItem({ status: "sending" }), NOW)).toBe(false);
  });

  it("the earliest timer ignores failed and sending items", () => {
    expect(earliestAttemptAt([])).toBeNull();
    expect(
      earliestAttemptAt([
        manualItem({ status: "failed" }),
        manualItem({ id: "a", nextAttemptAt: NOW + 9_000 }),
        voiceItem({ nextAttemptAt: NOW + 4_000, status: "blocked" }),
        manualItem({ id: "b", status: "sending", nextAttemptAt: 1 }),
      ]),
    ).toBe(NOW + 4_000);
  });
});

describe("itemAfterFailure", () => {
  it("retry: queued again with the backoff of the attempt count, keeping the key", () => {
    const first = itemAfterFailure(manualItem(), retry, NOW);
    expect(first).toMatchObject({ status: "queued", attempts: 1, nextAttemptAt: NOW + 5_000, lastError: "offline", idempotencyKey: "key-1" });
    const second = itemAfterFailure(first, retry, NOW);
    expect(second).toMatchObject({ attempts: 2, nextAttemptAt: NOW + 15_000 });
    const seventh = itemAfterFailure(manualItem({ attempts: 6 }), retry, NOW);
    expect(seventh.nextAttemptAt).toBe(NOW + 300_000);
  });

  it("retry honours a longer Retry-After than its own step", () => {
    const next = itemAfterFailure(manualItem(), { ...retry, retryAfterSeconds: 90 }, NOW);
    expect(next.nextAttemptAt).toBe(NOW + 90_000);
  });

  it("limit: blocked until the reset", () => {
    const next = itemAfterFailure(
      voiceItem(),
      { kind: "limit", message: "You've used today's 10 voice captures. Try again tomorrow.", retryAfterSeconds: 7200 },
      NOW,
    );
    expect(next).toMatchObject({ status: "blocked", nextAttemptAt: NOW + 7_200_000 + 60_000 });
    const noHeader = itemAfterFailure(voiceItem(), { kind: "limit", message: "x" }, NOW);
    expect(noHeader.nextAttemptAt).toBe(nextUtcMidnight(NOW) + 60_000);
  });

  it("fatal: failed with the server's message and no timer", () => {
    expect(itemAfterFailure(manualItem(), { kind: "fatal", message: "Input should be greater than 0" }, NOW)).toMatchObject({
      status: "failed",
      nextAttemptAt: null,
      lastError: "Input should be greater than 0",
    });
  });

  it("anything older than 30 days is failed as too old, whatever the failure", () => {
    const old = manualItem({ createdAt: NOW - MAX_ITEM_AGE_MS - 1000 });
    expect(itemAfterFailure(old, retry, NOW)).toMatchObject({ status: "failed", lastError: TOO_OLD_MESSAGE, nextAttemptAt: null });
  });
});

describe("itemForManualRetry and deferUntil", () => {
  it("Retry puts a failed item back in the line with a clean slate", () => {
    const failed = manualItem({ status: "failed", attempts: 4, nextAttemptAt: null, lastError: "nope" });
    const back = itemForManualRetry(failed);
    expect(back).toMatchObject({ status: "queued", attempts: 0, nextAttemptAt: null });
    expect(back.lastError).toBeUndefined();
  });

  it("deferUntil never moves an item earlier", () => {
    expect(deferUntil(manualItem({ nextAttemptAt: null }), NOW + 5).nextAttemptAt).toBe(NOW + 5);
    expect(deferUntil(manualItem({ nextAttemptAt: NOW + 100 }), NOW + 5).nextAttemptAt).toBe(NOW + 100);
  });
});
