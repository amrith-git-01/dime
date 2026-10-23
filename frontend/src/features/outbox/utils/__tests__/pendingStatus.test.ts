import { manualItem, NOW, voiceItem } from "@/lib/outbox/__tests__/fixtures";
import { SIGN_IN_AGAIN_MESSAGE } from "@/lib/outbox/failure";
import { TOO_OLD_MESSAGE } from "@/lib/outbox/outboxPolicy";
import { formatInrCompact } from "@/utils/currency";

import {
  describeItem,
  describeStatus,
  pendingChipLabel,
  pendingTone,
} from "../pendingStatus";

const online = { now: NOW, isOnline: true };

describe("pendingTone", () => {
  it("attention beats syncing beats waiting", () => {
    expect(pendingTone([manualItem()], false)).toBe("waiting");
    expect(pendingTone([manualItem()], true)).toBe("syncing");
    expect(pendingTone([manualItem({ status: "sending" })], false)).toBe("syncing");
    expect(pendingTone([manualItem(), manualItem({ id: "x", status: "failed" })], true)).toBe("attention");
    expect(pendingTone([voiceItem({ status: "blocked" })], false)).toBe("attention");
  });

  it("labels the chip for screen readers", () => {
    expect(pendingChipLabel(3, "waiting")).toBe("Pending 3, waiting to sync");
    expect(pendingChipLabel(1, "syncing")).toBe("Pending 1, syncing");
    expect(pendingChipLabel(2, "attention")).toBe("Pending 2, needs attention");
  });
});

describe("describeItem", () => {
  it("manual: amount and payee", () => {
    expect(describeItem(manualItem())).toBe(`${formatInrCompact("250.00")} · Swiggy`);
  });

  it("voice and receipt: kind and capture time", () => {
    expect(describeItem(voiceItem({ capturedAt: "2026-10-02T09:14:00" }))).toBe("Voice note · 2 Oct, 9:14 AM");
    expect(describeItem(voiceItem({ kind: "receipt", capturedAt: "2026-10-02T21:05:00" }))).toBe("Receipt photo · 2 Oct, 9:05 PM");
  });
});

describe("describeStatus", () => {
  it("queued: waiting for connection offline, retry countdown online", () => {
    expect(describeStatus(manualItem(), { now: NOW, isOnline: false })).toBe("Waiting for connection");
    expect(describeStatus(manualItem({ nextAttemptAt: NOW + 30_000 }), online)).toBe("Retrying in 30 s");
    expect(describeStatus(manualItem({ nextAttemptAt: NOW + 120_000 }), online)).toBe("Retrying in 2 min");
    expect(describeStatus(manualItem({ nextAttemptAt: NOW + 500 }), online)).toBe("Retrying in 1 s");
    expect(describeStatus(manualItem({ nextAttemptAt: NOW - 5 }), online)).toBe("Waiting to send");
    expect(describeStatus(manualItem({ nextAttemptAt: null }), online)).toBe("Waiting to send");
  });

  it("sending, blocked and failed", () => {
    expect(describeStatus(manualItem({ status: "sending" }), online)).toBe("Sending…");
    expect(describeStatus(voiceItem({ status: "blocked" }), online)).toBe("Daily limit reached. Retries tomorrow");
    expect(describeStatus(manualItem({ status: "failed", lastError: "Input should be greater than 0" }), online)).toBe(
      "Couldn't sync: Input should be greater than 0",
    );
    expect(describeStatus(manualItem({ status: "failed", lastError: TOO_OLD_MESSAGE }), online)).toBe("Too old to sync");
    expect(describeStatus(manualItem({ status: "failed", lastError: SIGN_IN_AGAIN_MESSAGE }), online)).toBe("Sign in again to sync");
  });
});
