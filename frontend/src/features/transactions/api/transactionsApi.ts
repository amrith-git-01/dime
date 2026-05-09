import { dimeApi } from "@/lib/api/dimeApi";

import type { CounterpartyType } from "../counterpartyTypes";
import type { TransactionRow, TransactionType } from "../types";

export type CreateTransactionBody = {
  amount: number;
  type: TransactionType;
  counterparty_name: string;
  counterparty_type: CounterpartyType;
  category: string | null;
  category_id?: string | null;
  note: string | null;
  /** ISO-8601 datetime string */
  transaction_at: string;
  detected_via?: string | null;
};

export async function fetchTransactions(): Promise<TransactionRow[]> {
  const { data } = await dimeApi.get<TransactionRow[]>("/api/v1/transactions");
  return data;
}
