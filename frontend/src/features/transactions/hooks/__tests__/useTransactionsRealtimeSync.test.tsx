import type { InfiniteData } from "@tanstack/react-query";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { TransactionListPage, TransactionRow } from "@/features/transactions/types";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";

import { useTransactionsRealtimeSync } from "../useTransactionsRealtimeSync";

type Subscription = { onChange: (payload: unknown) => void };
let subscription: Subscription | undefined;

jest.mock("@/lib/realtime", () => ({
  realtimeClient: {
    subscribe: jest.fn((options: Subscription) => {
      subscription = options;
      return () => undefined;
    }),
  },
}));
jest.mock("@/lib/outbox/outboxQueue", () => ({ expediteQueuedManualItems: jest.fn() }));
jest.mock("@/utils/deviceTimezone", () => ({ getDeviceIanaTimezone: () => "Asia/Kolkata" }));

const monthKey = transactionsQueryKeys.monthPages("u1", 2026, 10, "Asia/Kolkata");

function row(note: string | null): TransactionRow {
  return {
    id: "t1",
    user_id: "u1",
    amount: "10.00",
    type: "debit",
    counterparty_name: "Swiggy",
    counterparty_type: "merchant",
    counterparty_normalized: null,
    merchant: "Swiggy",
    category: null,
    category_id: null,
    category_icon_name: null,
    category_color: null,
    note,
    detected_via: "manual",
    transaction_at: "2026-10-15T08:00:00.000Z",
    created_at: "2026-10-15T08:00:00.000Z",
    updated_at: "2026-10-15T08:00:00.000Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
  };
}

function update(note: string, updatedAt: string) {
  return {
    eventType: "UPDATE" as const,
    old: { id: "t1" },
    new: { ...row(note), updated_at: updatedAt },
  };
}

function noteInList(qc: ReturnType<typeof createTestQueryClient>): string | null | undefined {
  return qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items[0]?.note;
}

describe("useTransactionsRealtimeSync echo suppression", () => {
  beforeEach(() => {
    subscription = undefined;
    recentTransactionMutations.clear();
  });

  function mount() {
    const qc = createTestQueryClient();
    qc.setQueryData<InfiniteData<TransactionListPage>>(monthKey, {
      pages: [{ items: [row("mine")], has_more: false }],
      pageParams: [0],
    });
    renderHookWithClient(qc, () => useTransactionsRealtimeSync("u1"));
    return qc;
  }

  it("skips the echo of this device's own write: same updated_at", () => {
    const qc = mount();
    recentTransactionMutations.mark("t1", "2026-10-15T08:00:05.000Z");
    subscription!.onChange(update("echo", "2026-10-15T08:00:05.000Z"));
    expect(noteInList(qc)).toBe("mine");
  });

  it("applies another device's change to the same row, even right after this device's own write", () => {
    const qc = mount();
    recentTransactionMutations.mark("t1", "2026-10-15T08:00:05.000Z");
    subscription!.onChange(update("from another device", "2026-10-15T08:00:07.000Z"));
    expect(noteInList(qc)).toBe("from another device");
  });

  it("applies an event for a row this device did not touch", () => {
    const qc = mount();
    subscription!.onChange(update("elsewhere", "2026-10-15T08:00:07.000Z"));
    expect(noteInList(qc)).toBe("elsewhere");
  });

  it("skips the removal echo of this device's own delete, but not a later restore of the row", () => {
    const qc = mount();
    recentTransactionMutations.mark("t1");
    subscription!.onChange({
      eventType: "UPDATE",
      old: { id: "t1" },
      new: { ...row("mine"), deleted_at: "2026-10-15T08:00:09.000Z", updated_at: "2026-10-15T08:00:09.000Z" },
    });
    // Skipped: the delete mutation already removed it from the lists (here it is still in the seed).
    expect(noteInList(qc)).toBe("mine");
    subscription!.onChange(update("restored elsewhere", "2026-10-15T08:00:12.000Z"));
    expect(noteInList(qc)).toBe("restored elsewhere");
  });
});
