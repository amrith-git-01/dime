import { onlineManager, type QueryClient } from "@tanstack/react-query";

import { useAppTourStore } from "@/features/appTour/store/appTourStore";
import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview, TransactionRow } from "@/features/transactions/types";
import { SubmitError } from "@/lib/outbox/failure";
import { MANUAL_BODY, manualItem } from "@/lib/outbox/__tests__/fixtures";
import { useOutboxStore } from "@/stores/outboxStore";
import { createTestQueryClient } from "@/test-utils/testQueryClient";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { resetMockMmkv } from "@/test-utils/mockMmkv";

import { offerSettleForTransaction } from "@/features/reminders/utils/settleOffer";

import { useSubmitManualTransactionMutation } from "../useSubmitManualTransactionMutation";

jest.mock("react-native-mmkv", () => jest.requireActual("@/test-utils/mockMmkv"));
jest.mock("expo-crypto", () => {
  let n = 0;
  return { randomUUID: jest.fn(() => `uuid-${++n}`) };
});
jest.mock("expo-file-system/legacy", () => ({ documentDirectory: null }));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(), fetch: jest.fn() },
}));
jest.mock("@/features/transactions/api/submitTransactionApi", () => ({
  submitManualTransaction: jest.fn(),
  submitReceipt: jest.fn(),
  submitVoice: jest.fn(),
}));
jest.mock("@/lib/outbox/outboxSync", () => ({ requestOutboxDrain: jest.fn() }));
jest.mock("@/features/reminders/utils/settleOffer", () => ({
  offerSettleForTransaction: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/features/appTour/store/appTourStore", () => ({
  useAppTourStore: { getState: () => ({ onTransactionSaved: jest.fn() }) },
}));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));
jest.mock("@/utils/deviceTimezone", () => ({ getDeviceIanaTimezone: () => "Asia/Kolkata" }));

const preview = manualItem().preview!;
const submit = jest.mocked(submitManualTransaction);

const savedRow = {
  id: "srv-1",
  user_id: "u1",
  amount: "250.00",
  type: "debit",
  counterparty_name: "Swiggy",
  merchant: "Swiggy",
  transaction_at: "2026-10-23T09:30:00.000Z",
} as TransactionRow;

function home(): HomeOverview {
  return { spent_today: "0", spent_this_month: "0", top_categories: [], recent_transactions: [] };
}

describe("useSubmitManualTransactionMutation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    resetMockMmkv();
    jest.clearAllMocks();
    useOutboxStore.getState().reset();
    queryClient = createTestQueryClient();
    onlineManager.setOnline(true);
  });

  afterEach(() => queryClient.clear());

  it("offline: queues without touching the network", async () => {
    onlineManager.setOnline(false);
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    let result: unknown;
    await hook.act(async () => {
      result = await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });
    expect(result).toEqual({ status: "queued" });
    expect(submit).not.toHaveBeenCalled();
    expect(useOutboxStore.getState().items).toHaveLength(1);
    expect(useOutboxStore.getState().items[0]).toMatchObject({ kind: "manual", body: MANUAL_BODY });
  });

  it("online success: patches the lists with the saved row and refetches only the aggregates", async () => {
    submit.mockResolvedValue({ id: "srv-1", created: true, transaction: savedRow });
    queryClient.setQueryData(transactionsQueryKeys.home("u1", "Asia/Kolkata"), home());
    queryClient.setQueryData(transactionsQueryKeys.monthSummary("u1", 2026, 10, "Asia/Kolkata"), {});
    queryClient.setQueryData(transactionsQueryKeys.monthPages("u1", 2026, 10, "Asia/Kolkata"), {
      pages: [{ items: [], has_more: false }],
      pageParams: [0],
    });
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });

    expect(submit).toHaveBeenCalledWith(MANUAL_BODY, expect.any(String), { timeout: 10_000 });
    expect(queryClient.getQueryData<HomeOverview>(transactionsQueryKeys.home("u1", "Asia/Kolkata"))?.recent_transactions[0]?.id).toBe("srv-1");
    // Totals refetch; the month list was patched, not invalidated.
    expect(queryClient.getQueryState(transactionsQueryKeys.home("u1", "Asia/Kolkata"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(transactionsQueryKeys.monthSummary("u1", 2026, 10, "Asia/Kolkata"))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(transactionsQueryKeys.monthPages("u1", 2026, 10, "Asia/Kolkata"))?.isInvalidated).toBe(false);
    expect(useOutboxStore.getState().items).toEqual([]);
    // A reminder that now looks paid by this entry is offered for settling (fire and forget).
    expect(offerSettleForTransaction).toHaveBeenCalledWith(queryClient, "u1", "srv-1");
  });

  it("does not look for a reminder to settle when the entry only waits in the outbox", async () => {
    onlineManager.setOnline(false);
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });
    expect(offerSettleForTransaction).not.toHaveBeenCalled();
  });

  it("an older server without `transaction` falls back to the full invalidation", async () => {
    submit.mockResolvedValue({ id: "srv-1", created: true });
    queryClient.setQueryData(transactionsQueryKeys.monthPages("u1", 2026, 10, "Asia/Kolkata"), {
      pages: [{ items: [], has_more: false }],
      pageParams: [0],
    });
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });
    expect(queryClient.getQueryState(transactionsQueryKeys.monthPages("u1", 2026, 10, "Asia/Kolkata"))?.isInvalidated).toBe(true);
  });

  it("online but the server cannot be reached: queues with the same idempotency key as the attempt", async () => {
    submit.mockRejectedValue(new SubmitError("Request timed out. Try again.", { networkFailure: true }));
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    let result: unknown;
    await hook.act(async () => {
      result = await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });
    expect(result).toEqual({ status: "queued" });
    const sentKey = submit.mock.calls[0]?.[1];
    expect(useOutboxStore.getState().items[0]?.idempotencyKey).toBe(sentKey);
  });

  it("a 5xx queues too", async () => {
    submit.mockRejectedValue(new SubmitError("Bad gateway", { status: 502 }));
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });
    expect(useOutboxStore.getState().items).toHaveLength(1);
  });

  it("a 4xx validation error is thrown for the form's error toast and nothing is queued", async () => {
    submit.mockRejectedValue(new SubmitError("Input should be greater than 0", { status: 422 }));
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await expect(hook.current.mutateAsync({ body: MANUAL_BODY, preview })).rejects.toThrow("Input should be greater than 0");
    });
    expect(useOutboxStore.getState().items).toEqual([]);
  });

  it("retrying the same payload after a failed save reuses the key; a changed payload gets a new one", async () => {
    submit.mockRejectedValue(new SubmitError("Input should be greater than 0", { status: 422 }));
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview }).catch(() => undefined);
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview }).catch(() => undefined);
      await hook.current.mutateAsync({ body: { ...MANUAL_BODY, amount: "300.00" }, preview }).catch(() => undefined);
    });
    const keys = submit.mock.calls.map((call) => call[1]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("raises the tour event on a queued save as well as a sent one", async () => {
    const onTransactionSaved = jest.fn();
    jest.spyOn(useAppTourStore, "getState").mockReturnValue({ onTransactionSaved } as never);
    onlineManager.setOnline(false);
    const hook = renderHookWithClient(queryClient, useSubmitManualTransactionMutation);
    await hook.act(async () => {
      await hook.current.mutateAsync({ body: MANUAL_BODY, preview });
    });
    expect(onTransactionSaved).toHaveBeenCalledTimes(1);
  });
});
