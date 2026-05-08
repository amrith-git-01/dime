import { dimeApi } from "@/lib/api/dimeApi";

import type { TransactionRow, TransactionType } from "../types";

export type CreateTransactionBody = {
  amount: number;
  type: TransactionType;
  merchant: string;
  category: string | null;
  note: string | null;
  /** ISO-8601 datetime string */
  transaction_at: string;
  detected_via?: string | null;
};

export async function fetchTransactions(): Promise<TransactionRow[]> {
  const { data } = await dimeApi.get<TransactionRow[]>("/api/v1/transactions");
  return data;
}

export async function createTransaction(
  body: CreateTransactionBody,
): Promise<TransactionRow> {
  const { data } = await dimeApi.post<TransactionRow>(
    "/api/v1/transactions",
    body,
  );
  return data;
}
