import { dimeApi } from "@/lib/api/dimeApi";

import type { PaybackCandidate, TransactionOffsetList } from "../types";

/** The live paybacks of a transaction, each with the other side of the link, and the totals. */
export async function fetchTransactionOffsets(id: string): Promise<TransactionOffsetList> {
  const { data } = await dimeApi.get<TransactionOffsetList>(`/api/v1/transactions/${id}/offsets`);
  return data;
}

/**
 * Rows a transaction could be linked to: for a credit, spends of the last 45 days it could pay back; for a
 * spend, credits that came in after it. Same payee first.
 */
export async function fetchPaybackCandidates(id: string): Promise<PaybackCandidate[]> {
  const { data } = await dimeApi.get<{ items: PaybackCandidate[] }>(
    `/api/v1/transactions/${id}/payback-candidates`,
  );
  return Array.isArray(data?.items) ? data.items : [];
}

export type CreateOffsetBody = {
  credit_id: string;
  debit_id: string;
  /** Rupees of the credit that pay back the debit: a decimal string such as `"500.00"`. */
  amount: string;
};

/** Links (part of) a credit to the debit it pays back. */
export async function createTransactionOffset(body: CreateOffsetBody): Promise<void> {
  await dimeApi.post("/api/v1/transactions/offsets", body);
}

/** Unlinks: the credit's amount goes back to counting as income (or lowering spend, for a refund). */
export async function deleteTransactionOffset(offsetId: string): Promise<void> {
  await dimeApi.delete(`/api/v1/transactions/offsets/${offsetId}`);
}
