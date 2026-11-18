import { onlineManager } from "@tanstack/react-query";

import { recurringQueryKeys } from "@/features/recurring/queryKeys";
import type { PostedManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import type { TransactionRow } from "@/features/transactions/types";
import { renderHookWithClient } from "@/test-utils/renderHookWithClient";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { pickManualSaveHint, useManualSaveFollowUps } from "../useManualSaveFollowUps";

const mockShowToast = jest.fn();
const mockDelete = jest.fn(() => Promise.resolve({ status: "sent" }));
const mockLink = jest.fn(() => Promise.resolve());

jest.mock("@/features/toast/useToast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("@/hooks/useSessionUserId", () => ({ useSessionUserId: () => ({ userId: "u1" }) }));
jest.mock("../useDeleteTransactionMutation", () => ({
  useDeleteTransactionMutation: () => ({ mutateAsync: mockDelete }),
}));
jest.mock("@/features/recurring/hooks/useRecurringMutations", () => ({
  useLinkRecurringMutation: () => ({ mutateAsync: mockLink }),
}));

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: "t1",
    user_id: "u1",
    amount: "250.00",
    type: "debit",
    kind: "spend",
    counterparty_name: "Netflix",
    counterparty_type: "merchant",
    counterparty_normalized: null,
    merchant: "Netflix",
    category: null,
    category_id: null,
    category_icon_name: null,
    category_color: null,
    note: null,
    detected_via: "manual",
    transaction_at: "2026-10-15T08:00:00.000Z",
    created_at: "2026-10-15T08:00:00.000Z",
    updated_at: "2026-10-15T08:00:03.000Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...over,
  };
}

describe("pickManualSaveHint", () => {
  it("offers nothing for a plain add, or an add the server merged into an existing row", () => {
    expect(pickManualSaveHint({ transaction: row(), created: true })).toBeNull();
    expect(pickManualSaveHint({ transaction: row(), created: false, possibleDuplicateOf: "x" })).toBeNull();
    expect(pickManualSaveHint({ created: true, possibleDuplicateOf: "x" })).toBeNull();
  });

  it("a possible duplicate comes first, then a possible recurring bill, then a payback from a person", () => {
    const person = row({ type: "credit", kind: "income", counterparty_type: "person" });
    const everything: PostedManualTransaction = {
      transaction: person,
      created: true,
      possibleDuplicateOf: "dup",
      possibleRecurring: { itemId: "rec-1", occurrence: "2026-10-15" },
    };
    expect(pickManualSaveHint(everything)).toMatchObject({ kind: "duplicate" });
    expect(pickManualSaveHint({ ...everything, possibleDuplicateOf: undefined })).toMatchObject({
      kind: "recurring",
      itemId: "rec-1",
      occurrence: "2026-10-15",
    });
    expect(pickManualSaveHint({ transaction: person, created: true })).toMatchObject({ kind: "payback" });
  });

  it("money received from a shop, or a transfer from a person, is not a payback", () => {
    expect(pickManualSaveHint({ transaction: row({ type: "credit", kind: "income" }), created: true })).toBeNull();
    expect(
      pickManualSaveHint({
        transaction: row({ type: "credit", kind: "transfer", counterparty_type: "person" }),
        created: true,
      }),
    ).toBeNull();
  });
});

describe("useManualSaveFollowUps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    onlineManager.setOnline(true);
  });

  function setup() {
    const qc = createTestQueryClient();
    qc.setQueryData([...recurringQueryKeys.all, "list", "u1", "subscription"], {
      items: [{ id: "rec-1", name: "Netflix" }],
      summary: {},
    });
    const onOpenPaidBack = jest.fn();
    const hook = renderHookWithClient(qc, () => useManualSaveFollowUps({ onOpenPaidBack }));
    return { hook, onOpenPaidBack };
  }

  it("says 'Looks like a duplicate' with an Undo that deletes the new row, guarded by its updated_at", () => {
    const { hook } = setup();
    expect(hook.current({ transaction: row(), created: true, possibleDuplicateOf: "dup" })).toBe(true);
    const toast = mockShowToast.mock.calls[0]![0];
    expect(toast).toMatchObject({ message: "Looks like a duplicate", action: { label: "Undo" } });
    toast.action.onPress();
    expect(mockDelete).toHaveBeenCalledWith({
      id: "t1",
      expectedUpdatedAt: "2026-10-15T08:00:03.000Z",
      row: expect.objectContaining({ id: "t1" }),
    });
  });

  it("asks 'Is this your Netflix bill?' and links the entry to that occurrence on yes", () => {
    const { hook } = setup();
    expect(
      hook.current({
        transaction: row(),
        created: true,
        possibleRecurring: { itemId: "rec-1", occurrence: "2026-10-15" },
      }),
    ).toBe(true);
    const toast = mockShowToast.mock.calls[0]![0];
    expect(toast.message).toBe("Is this your Netflix bill?");
    toast.action.onPress();
    expect(mockLink).toHaveBeenCalledWith({ itemId: "rec-1", transactionId: "t1", occurrence: "2026-10-15" });
  });

  it("offers 'Paying you back for something?' after money received from a person, and opens the picker", () => {
    const { hook, onOpenPaidBack } = setup();
    const credit = row({ type: "credit", kind: "income", counterparty_type: "person", counterparty_name: "Ravi" });
    expect(hook.current({ transaction: credit, created: true })).toBe(true);
    const toast = mockShowToast.mock.calls[0]![0];
    expect(toast.message).toBe("Paying you back for something?");
    toast.action.onPress();
    expect(onOpenPaidBack).toHaveBeenCalledWith(credit);
  });

  it("stays quiet (and returns false) when there is nothing to ask", () => {
    const { hook } = setup();
    expect(hook.current({ transaction: row(), created: true })).toBe(false);
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
