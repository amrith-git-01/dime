import { onlineManager, type InfiniteData } from "@tanstack/react-query";
import { AxiosError } from "axios";

import {
  deleteTransaction,
  restoreTransaction,
  updateTransaction,
} from "@/features/transactions/api/transactionsApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { TransactionListPage, TransactionRow } from "@/features/transactions/types";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { isTransactionStaleError } from "@/features/transactions/utils/staleError";
import {
  cancelPendingCreate,
  discardOutboxItem,
  editPendingCreate,
  enqueueTransactionDelete,
  enqueueTransactionUpdate,
} from "@/lib/outbox/outboxQueue";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";

import { useDeleteTransactionMutation } from "../useDeleteTransactionMutation";
import { useRestoreTransactionMutation } from "../useRestoreTransactionMutation";
import { useUpdateTransactionMutation } from "../useUpdateTransactionMutation";

jest.mock("@/features/transactions/api/transactionsApi", () => ({
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
  restoreTransaction: jest.fn(),
}));
jest.mock("@/lib/outbox/outboxQueue", () => ({
  enqueueTransactionUpdate: jest.fn(() => ({ id: "optimistic-manual-q1" })),
  enqueueTransactionDelete: jest.fn(() => ({ id: "optimistic-manual-q2" })),
  discardOutboxItem: jest.fn(),
  editPendingCreate: jest.fn(() => null),
  cancelPendingCreate: jest.fn(() => null),
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

function staleError(): AxiosError {
  return new AxiosError("Conflict", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    data: { detail: "This transaction changed on another device.", code: "stale" },
    headers: {},
    config: {} as never,
    statusText: "Conflict",
  });
}

describe("useUpdateTransactionMutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recentTransactionMutations.clear();
    onlineManager.setOnline(true);
  });
  afterEach(() => onlineManager.setOnline(true));

  it("patches the lists and the detail with the row the PATCH returns, refetching only the aggregates", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(updateTransaction).mockResolvedValue(row({ note: "edited", updated_at: "2026-10-15T08:00:05.000Z" }));
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1", body: BODY });
    });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items[0]?.note).toBe("edited");
    expect(qc.getQueryData<TransactionRow>(detailKey)?.note).toBe("edited");
    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(monthKey)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(false);
    // The realtime echo of this edit (the updated_at the server answered) is skipped.
    expect(recentTransactionMutations.isEcho("t1", { updatedAt: "2026-10-15T08:00:05.000Z" })).toBe(true);
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

  it("sends the changed fields with the updated_at they were made against", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(updateTransaction).mockResolvedValue(row({ note: "edited" }));
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    const body = { note: "edited", expected_updated_at: "2026-10-15T08:00:00.000Z" };
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1", body });
    });
    expect(updateTransaction).toHaveBeenCalledWith("t1", body, expect.objectContaining({ timeout: expect.any(Number) }));
  });

  it("a 409 stale surfaces as a stale error and leaves the caches alone", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(updateTransaction).mockRejectedValue(staleError());
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    let thrown: unknown;
    await hook.act(async () => {
      thrown = await hook.current.mutateAsync({ id: "t1", body: { note: "x" } }).catch((e: unknown) => e);
    });
    expect(isTransactionStaleError(thrown)).toBe(true);
    expect(enqueueTransactionUpdate).not.toHaveBeenCalled();
    expect(qc.getQueryData<TransactionRow>(detailKey)?.note).toBeNull();
  });

  it("offline, the edit is queued and shown in the lists until it syncs", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    onlineManager.setOnline(false);
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    const body = { note: "offline edit", expected_updated_at: "2026-10-15T08:00:00.000Z" };
    let result: unknown;
    await hook.act(async () => {
      result = await hook.current.mutateAsync({ id: "t1", body, original: row() });
    });
    expect(result).toEqual({ status: "queued" });
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(enqueueTransactionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", targetId: "t1", patch: body }),
    );
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items[0]?.note).toBe("offline edit");
    expect(qc.getQueryData<TransactionRow>(detailKey)?.note).toBe("offline edit");
  });
});

describe("useUpdateTransactionMutation on an entry that is still a pending create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
  });

  it("routes the edit into the waiting create: nothing is sent or queued against the local id, no cache entry is made", async () => {
    const qc = createTestQueryClient();
    jest.mocked(editPendingCreate).mockReturnValueOnce("edited");
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    let result: unknown;
    await hook.act(async () => {
      result = await hook.current.mutateAsync({
        id: "optimistic-manual-1",
        body: { note: "x", expected_updated_at: "2026-10-15T08:00:00.000Z" },
        original: row({ id: "optimistic-manual-1" }),
      });
    });
    expect(result).toEqual({ status: "queued", pendingCreate: true });
    expect(editPendingCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", targetId: "optimistic-manual-1" }),
    );
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(enqueueTransactionUpdate).not.toHaveBeenCalled();
    expect(qc.getQueryData(transactionsQueryKeys.detail("u1", "optimistic-manual-1"))).toBeUndefined();
  });

  it("asks the user to retry while that create is in flight", async () => {
    const qc = createTestQueryClient();
    jest.mocked(editPendingCreate).mockReturnValueOnce("syncing");
    const hook = renderHookWithClient(qc, useUpdateTransactionMutation);
    let thrown: unknown;
    await hook.act(async () => {
      thrown = await hook.current
        .mutateAsync({ id: "optimistic-manual-1", body: { note: "x" } })
        .catch((e: unknown) => e);
    });
    expect((thrown as Error).message).toMatch(/try again/i);
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(enqueueTransactionUpdate).not.toHaveBeenCalled();
  });
});

describe("useDeleteTransactionMutation on an entry that is still a pending create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
  });

  it("cancels the waiting create instead of sending or queuing a delete against the local id", async () => {
    const qc = createTestQueryClient();
    jest.mocked(cancelPendingCreate).mockReturnValueOnce("cancelled");
    const hook = renderHookWithClient(qc, useDeleteTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "optimistic-manual-1" });
    });
    expect(cancelPendingCreate).toHaveBeenCalledWith("u1", "optimistic-manual-1");
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(enqueueTransactionDelete).not.toHaveBeenCalled();
  });
});

describe("useDeleteTransactionMutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recentTransactionMutations.clear();
    onlineManager.setOnline(true);
  });
  afterEach(() => onlineManager.setOnline(true));

  it("removes the row from the lists in place and refetches only the aggregates", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(deleteTransaction).mockResolvedValue(undefined);
    const hook = renderHookWithClient(qc, useDeleteTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1" });
    });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items).toEqual([]);
    expect(qc.getQueryData<{ recent_transactions: TransactionRow[] }>(homeKey)?.recent_transactions).toEqual([]);
    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(monthKey)?.isInvalidated).toBe(false);
    expect(recentTransactionMutations.isRecent("t1")).toBe(true);
  });

  it("sends the updated_at the user last saw", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(deleteTransaction).mockResolvedValue(undefined);
    const hook = renderHookWithClient(qc, useDeleteTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1", expectedUpdatedAt: "2026-10-15T08:00:00.000Z" });
    });
    expect(deleteTransaction).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ expectedUpdatedAt: "2026-10-15T08:00:00.000Z" }),
    );
  });

  it("a 409 stale keeps the row in the lists", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    jest.mocked(deleteTransaction).mockRejectedValue(staleError());
    const hook = renderHookWithClient(qc, useDeleteTransactionMutation);
    let thrown: unknown;
    await hook.act(async () => {
      thrown = await hook.current.mutateAsync({ id: "t1" }).catch((e: unknown) => e);
    });
    expect(isTransactionStaleError(thrown)).toBe(true);
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items).toHaveLength(1);
  });

  it("offline, the delete is queued and the row leaves the lists", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    onlineManager.setOnline(false);
    const hook = renderHookWithClient(qc, useDeleteTransactionMutation);
    let result: unknown;
    await hook.act(async () => {
      result = await hook.current.mutateAsync({ id: "t1", expectedUpdatedAt: "2026-10-15T08:00:00.000Z", row: row() });
    });
    expect(result).toEqual({ status: "queued", outboxId: "optimistic-manual-q2" });
    expect(deleteTransaction).not.toHaveBeenCalled();
    expect(enqueueTransactionDelete).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: "t1", expectedUpdatedAt: "2026-10-15T08:00:00.000Z" }),
    );
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items).toEqual([]);
  });
});

describe("useRestoreTransactionMutation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recentTransactionMutations.clear();
  });

  it("puts the restored row back in the lists and refetches the totals", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    qc.setQueryData<InfiniteData<TransactionListPage>>(monthKey, { pages: [{ items: [], has_more: false }], pageParams: [0] });
    jest.mocked(restoreTransaction).mockResolvedValue(row({ updated_at: "2026-10-15T08:00:09.000Z" }));
    const hook = renderHookWithClient(qc, useRestoreTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1" });
    });
    expect(qc.getQueryData<InfiniteData<TransactionListPage>>(monthKey)?.pages[0]?.items.map((r) => r.id)).toEqual(["t1"]);
    expect(qc.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    // The realtime echo of the restore (same updated_at) is skipped; another device's change is not.
    expect(recentTransactionMutations.isEcho("t1", { updatedAt: "2026-10-15T08:00:09.000Z" })).toBe(true);
    expect(recentTransactionMutations.isEcho("t1", { updatedAt: "2026-10-15T08:00:12.000Z" })).toBe(false);
  });

  it("undoing a delete that never reached the server just discards the queued delete", async () => {
    const qc = createTestQueryClient();
    seed(qc);
    const hook = renderHookWithClient(qc, useRestoreTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ id: "t1", queuedDeleteOutboxId: "optimistic-manual-q2" });
    });
    expect(restoreTransaction).not.toHaveBeenCalled();
    expect(discardOutboxItem).toHaveBeenCalledWith("optimistic-manual-q2");
    expect(qc.getQueryState(monthKey)?.isInvalidated).toBe(true);
  });
});
