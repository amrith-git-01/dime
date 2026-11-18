import { dimeApi } from "@/lib/api/dimeApi";

import { deleteTransaction, restoreTransaction, updateTransaction } from "../transactionsApi";
import {
  createTransactionOffset,
  deleteTransactionOffset,
  fetchPaybackCandidates,
  fetchTransactionOffsets,
} from "../offsetsApi";
import { postManualTransaction } from "../submitTransactionApi";

jest.mock("@/lib/api/dimeApi", () => ({
  dimeApi: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  getDimeApiBaseUrl: () => "https://api.test",
  getDimeAuthHeaders: jest.fn(),
  refreshDimeAuthHeaders: jest.fn(),
}));
jest.mock("@/lib/auth/session", () => ({ getSession: jest.fn() }));
jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));
jest.mock("@/utils/deviceTimezone", () => ({ getDeviceIanaTimezone: () => "Asia/Kolkata" }));

const get = jest.mocked(dimeApi.get);
const post = jest.mocked(dimeApi.post);
const patch = jest.mocked(dimeApi.patch);
const del = jest.mocked(dimeApi.delete);

beforeEach(() => jest.clearAllMocks());

describe("edits and deletes carry the staleness guard", () => {
  it("PATCH sends the body as it is (only the changed fields and expected_updated_at)", async () => {
    patch.mockResolvedValue({ data: { id: "t1", updated_at: "x" } });
    const body = { note: "n", expected_updated_at: "2026-10-15T08:00:00.000Z" };
    await expect(updateTransaction("t1", body, { timeout: 5000, outboxUserId: "u1" })).resolves.toMatchObject({ id: "t1" });
    expect(patch).toHaveBeenCalledWith("/api/v1/transactions/t1", body, { timeout: 5000, _outboxUserId: "u1" });
  });

  it("DELETE sends expected_updated_at as a query parameter, and none when there is nothing to guard with", async () => {
    del.mockResolvedValue({});
    await deleteTransaction("t1", { expectedUpdatedAt: "2026-10-15T08:00:00.000Z" });
    expect(del).toHaveBeenLastCalledWith("/api/v1/transactions/t1", {
      params: { expected_updated_at: "2026-10-15T08:00:00.000Z" },
    });
    await deleteTransaction("t1");
    expect(del).toHaveBeenLastCalledWith("/api/v1/transactions/t1", {});
  });

  it("restore posts to the restore endpoint and answers the row", async () => {
    post.mockResolvedValue({ data: { id: "t1" } });
    await expect(restoreTransaction("t1")).resolves.toMatchObject({ id: "t1" });
    expect(post).toHaveBeenCalledWith("/api/v1/transactions/t1/restore", {}, {});
    post.mockResolvedValue({ data: undefined });
    await expect(restoreTransaction("t1")).resolves.toBeUndefined();
  });
});

describe("paybacks", () => {
  it("reads a transaction's links and its candidates", async () => {
    get.mockResolvedValueOnce({ data: { items: [], offset_total: "0.00", effective_amount: "10.00" } });
    await expect(fetchTransactionOffsets("t1")).resolves.toMatchObject({ effective_amount: "10.00" });
    expect(get).toHaveBeenLastCalledWith("/api/v1/transactions/t1/offsets");
    get.mockResolvedValueOnce({ data: { items: [{ transaction: { id: "d1" }, remaining: "5.00", payee_match: true }] } });
    await expect(fetchPaybackCandidates("t1")).resolves.toHaveLength(1);
    expect(get).toHaveBeenLastCalledWith("/api/v1/transactions/t1/payback-candidates");
    get.mockResolvedValueOnce({ data: {} });
    await expect(fetchPaybackCandidates("t1")).resolves.toEqual([]);
  });

  it("links a credit to a debit and unlinks", async () => {
    post.mockResolvedValue({ data: {} });
    await createTransactionOffset({ credit_id: "c1", debit_id: "d1", amount: "500.00" });
    expect(post).toHaveBeenCalledWith("/api/v1/transactions/offsets", { credit_id: "c1", debit_id: "d1", amount: "500.00" });
    del.mockResolvedValue({});
    await deleteTransactionOffset("o1");
    expect(del).toHaveBeenCalledWith("/api/v1/transactions/offsets/o1");
  });
});

describe("postManualTransaction: what the add answers with", () => {
  const body = {
    amount: "250.00",
    type: "debit" as const,
    counterparty_name: "Netflix",
    counterparty_type: "merchant" as const,
    category: null,
    note: null,
    transaction_at: "2026-10-15T08:00:00.000Z",
  };
  const saved = { id: "t1", transaction_at: "2026-10-15T08:00:00.000Z" };

  it("carries possible_duplicate_of and possible_recurring as camelCase hints", async () => {
    post.mockResolvedValue({
      data: {
        accepted: true,
        id: "t1",
        created: true,
        transaction: saved,
        possible_duplicate_of: "dup-1",
        possible_recurring: { item_id: "rec-1", occurrence: "2026-10-15" },
      },
    });
    await expect(postManualTransaction(body, "key")).resolves.toEqual({
      id: "t1",
      created: true,
      transaction: saved,
      possibleDuplicateOf: "dup-1",
      possibleRecurring: { itemId: "rec-1", occurrence: "2026-10-15" },
    });
  });

  it("has no hints from a server that does not send them, and ignores malformed ones", async () => {
    post.mockResolvedValue({ data: { accepted: true, id: "t1", created: true, transaction: saved } });
    await expect(postManualTransaction(body, "key")).resolves.toEqual({ id: "t1", created: true, transaction: saved });
    post.mockResolvedValue({
      data: { accepted: true, id: "t1", possible_duplicate_of: 5, possible_recurring: { item_id: 1 } },
    });
    await expect(postManualTransaction(body, "key")).resolves.toEqual({ id: "t1" });
  });
});
