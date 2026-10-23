import type { InfiniteData } from "@tanstack/react-query";

import { deleteTransaction, updateTransaction } from "@/features/transactions/api/transactionsApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { TransactionListPage, TransactionRow } from "@/features/transactions/types";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";

import { useDeleteTransactionMutation } from "../useDeleteTransactionMutation";
import { useUpdateTransactionMutation } from "../useUpdateTransactionMutation";

jest.mock("@/features/transactions/api/transactionsApi", () => ({
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));
jest.mock("@/utils/deviceTimezone", () => ({ getDeviceIanaTimezone: () => "Asia/Kolkata" }));

const TZ = "Asia/Kolkata";
const monthKey = transactionsQueryKeys.monthPages("u1", 2026, 10, TZ);
const homeKey = transactionsQueryKeys.home("u1", TZ);
const summaryKey = transactionsQueryKeys.monthSummary("u1", 2026, 10, TZ);
const detailKey = transactionsQueryKeys.detail("u1", "t1");

function row(over: Partial<TransactionRow> = {}): TransactionRow {
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

function seed(qc: ReturnType<typeof createTestQueryClient>) {
  qc.setQueryData<InfiniteData<TransactionListPage>>(monthKey, { pages: [{ items: [row()], has_more: false }], pageParams: [0] });
  qc.setQueryData(homeKey, { recent_transactions: [row()] });
  qc.setQueryData(summaryKey, {});
  qc.setQueryData(detailKey, row());
}

const BODY = {
  amount: "10.00",
  type: "debit" as const,
  counterparty_name: "Swiggy",
  counterparty_type: "merchant" as const,
  category: null,
  note: "edited",
  transaction_at: "2026-10-15T08:00:00.000Z",
};

describe("useUpdateTransactionMutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recentTransactionMutations.clear();
  });

  it("patches the lists and the detail with the row the PATCH returns, refetching only the aggregates", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(updateTransaction).mockResolvedValue(row({ note: "edited" }));
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1", body: BODY });
    });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items[0]?.note).toBe("edited");
    expect(qc.getQueryData<TransactionRow>(detailKey)?.note).toBe("edited");
    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(monthKey)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(false);
    // The realtime echo of this edit is skipped.
    expect(recentTransactionMutations.isRecent("t1")).toBe(true);
  });

  it("without a row in the answer (an older server) everything is invalidated", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(updateTransaction).mockResolvedValue(undefined);
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1", body: BODY });
    });
    expect(qc.getQueryState(monthKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });
});

describe("useDeleteTransactionMutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recentTransactionMutations.clear();
  });

  it("removes the row from the lists in place and refetches only the aggregates", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(deleteTransaction).mockResolvedValue(undefined);
    const hook = renderHookWithClient(qc, useDeleteTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync("t1");
    });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items).toEqual([]);
    expect(qc.getQueryData<{ recent_transactions: TransactionRow[] }>(homeKey)?.recent_transactions).toEqual([]);
    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(monthKey)?.isInvalidated).toBe(false);
    expect(recentTransactionMutations.isRecent("t1")).toBe(true);
  });
});
