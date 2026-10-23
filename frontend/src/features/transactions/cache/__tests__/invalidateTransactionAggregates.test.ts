import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { onboardingQueryKeys } from "@/features/onboarding/queryKeys";
import { payeesQueryKeys } from "@/features/payees/queryKeys";
import { recurringQueryKeys } from "@/features/recurring/queryKeys";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { transactionsQueryKeys } from "../../queryKeys";
import { transactionCalendarDayKey } from "../../utils/buildTransactionFlashListData";
import type { TransactionListPage, TransactionRow } from "../../types";
import {
  invalidateTransactionAggregates,
  invalidateTransactionDerivedQueries,
} from "../invalidateTransactionQueries";
import {
  applyTransactionInsertToListCaches,
  applyTransactionRemoveFromListCaches,
  applyTransactionUpdateToListCaches,
} from "../transactionListCache";

const TZ = "Asia/Kolkata";

function row(over: Partial<TransactionRow>): TransactionRow {
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
    note: null,
    detected_via: "manual",
    transaction_at: "2026-10-15T08:00:00.000Z",
    created_at: "2026-10-15T08:00:00.000Z",
    updated_at: "2026-10-15T08:00:00.000Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...over,
  };
}

function pages(items: TransactionRow[], hasMore = false): InfiniteData<TransactionListPage> {
  return { pages: [{ items, has_more: hasMore }], pageParams: [0] };
}

const KEYS = {
  home: transactionsQueryKeys.home("u1", TZ),
  monthSummary: transactionsQueryKeys.monthSummary("u1", 2026, 10, TZ),
  monthPages: transactionsQueryKeys.monthPages("u1", 2026, 10, TZ),
  filteredMonthPages: transactionsQueryKeys.filteredMonthPages("u1", 2026, 10, TZ, { payee: "sw" }),
  rangePages: transactionsQueryKeys.rangePages("u1", "a", "b"),
  detail: transactionsQueryKeys.detail("u1", "t1"),
  insights: insightsQueryKeys.month("u1", 2026, 10, TZ),
  recurring: [...recurringQueryKeys.all, "x"] as const,
  payees: [...payeesQueryKeys.suggestionsAll, "debit"] as const,
  notifications: [...notificationQueryKeys.all, "x"] as const,
  onboarding: [...onboardingQueryKeys.all, "x"] as const,
};

function seed(qc: QueryClient): void {
  for (const key of Object.values(KEYS)) {
    qc.setQueryData(key, key === KEYS.monthPages ? pages([]) : {});
  }
}

const invalidated = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated;

describe("invalidateTransactionAggregates", () => {
  it("invalidates everything derived except the patched month pages and the detail query", () => {
    const qc = createTestQueryClient();
    seed(qc);
    invalidateTransactionAggregates(qc);
    expect(invalidated(qc, KEYS.home)).toBe(true);
    expect(invalidated(qc, KEYS.monthSummary)).toBe(true);
    expect(invalidated(qc, KEYS.filteredMonthPages)).toBe(true);
    expect(invalidated(qc, KEYS.rangePages)).toBe(true);
    expect(invalidated(qc, KEYS.insights)).toBe(true);
    expect(invalidated(qc, KEYS.recurring)).toBe(true);
    expect(invalidated(qc, KEYS.payees)).toBe(true);
    expect(invalidated(qc, KEYS.notifications)).toBe(true);
    expect(invalidated(qc, KEYS.onboarding)).toBe(true);
    expect(invalidated(qc, KEYS.monthPages)).toBe(false);
    expect(invalidated(qc, KEYS.detail)).toBe(false);
  });

  it("the full variant still invalidates the month pages and detail (resync after a gap)", () => {
    const qc = createTestQueryClient();
    seed(qc);
    invalidateTransactionDerivedQueries(qc);
    expect(invalidated(qc, KEYS.monthPages)).toBe(true);
    expect(invalidated(qc, KEYS.detail)).toBe(true);
  });
});

describe("list cache patches used after a write", () => {
  it("insert puts the row at the top of the month and of home recent", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(KEYS.monthPages, pages([row({ id: "old" })]));
    qc.setQueryData(KEYS.home, { recent_transactions: [row({ id: "old" })] });
    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: row({ id: "new", transaction_at: "2026-10-16T08:00:00.000Z" }) });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)?.pages[0]?.items.map((r) => r.id)).toEqual(["new", "old"]);
    expect(qc.getQueryData<{ recent_transactions: TransactionRow[] }>(KEYS.home)?.recent_transactions.map((r) => r.id)).toEqual(["new", "old"]);
    expect(invalidated(qc, KEYS.monthPages)).toBe(false);
  });

  it("inserting the same row twice (the realtime echo) leaves one copy", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(KEYS.monthPages, pages([]));
    const saved = row({ id: "new" });
    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: saved });
    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: saved });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)?.pages[0]?.items).toHaveLength(1);
    expect(invalidated(qc, KEYS.monthPages)).toBe(false);
  });

  it("a new row in a month with older pages still to load refetches it (the offset shifts)", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(KEYS.monthPages, pages([row({ id: "old" })], true));
    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: row({ id: "new" }) });
    expect(invalidated(qc, KEYS.monthPages)).toBe(true);
    // The patch is still there for the wait.
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)?.pages[0]?.items.map((r) => r.id)).toContain("new");
  });

  it("inserting a row that is already listed (an idempotent replay, the realtime echo after the POST) does not double-count the day", () => {
    const qc = createTestQueryClient();
    const existing = row({ id: "a", amount: "10.00" });
    const dayKey = transactionCalendarDayKey(existing.transaction_at);
    const data = pages([existing]);
    data.pages[0]!.day_summaries = {
      [dayKey]: { date: dayKey, credit_total: "0.00", debit_total: "10.00", net: "-10.00", transaction_count: 1 },
    };
    qc.setQueryData(KEYS.monthPages, data);

    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: row({ id: "a", amount: "10.00" }) });
    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: row({ id: "a", amount: "10.00" }) });
    const after = qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)!;
    expect(after.pages[0]?.items).toHaveLength(1);
    expect(after.pages[0]?.day_summaries?.[dayKey]).toMatchObject({ debit_total: "10.00", net: "-10.00", transaction_count: 1 });

    // A merged amount on the same id moves the total by the difference, still one row.
    applyTransactionInsertToListCaches(qc, { userId: "u1", timezone: TZ, row: row({ id: "a", amount: "25.00" }) });
    const merged = qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)!;
    expect(merged.pages[0]?.day_summaries?.[dayKey]).toMatchObject({ debit_total: "25.00", transaction_count: 1 });
  });

  it("update replaces the row in place; remove drops it", () => {
    const qc = createTestQueryClient();
    qc.setQueryData(KEYS.monthPages, pages([row({ id: "a", note: "before" })]));
    applyTransactionUpdateToListCaches(qc, { userId: "u1", timezone: TZ, row: row({ id: "a", note: "after" }) });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)?.pages[0]?.items[0]?.note).toBe("after");
    applyTransactionRemoveFromListCaches(qc, { userId: "u1", timezone: TZ, transactionId: "a" });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(KEYS.monthPages)?.pages[0]?.items).toEqual([]);
  });
});
