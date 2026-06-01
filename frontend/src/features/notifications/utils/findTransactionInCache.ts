import type { QueryClient } from "@tanstack/react-query";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { TransactionRow } from "@/features/transactions/types";

function rowFromUnknown(value: unknown): TransactionRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<TransactionRow>;
  if (typeof row.id !== "string") return null;
  return row as TransactionRow;
}

/** Best-effort lookup from already-fetched transaction queries. */
export function findTransactionInCache(
  queryClient: QueryClient,
  transactionId: string,
): TransactionRow | null {
  const queries = queryClient.getQueriesData({
    queryKey: transactionsQueryKeys.all,
  });

  for (const [, data] of queries) {
    if (!data) continue;

    if (Array.isArray(data)) {
      for (const item of data) {
        const row = rowFromUnknown(item);
        if (row?.id === transactionId) return row;
      }
      continue;
    }

    if (typeof data === "object" && data !== null && "items" in data) {
      const items = (data as { items: unknown }).items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const row = rowFromUnknown(item);
        if (row?.id === transactionId) return row;
      }
      continue;
    }

    if (typeof data === "object" && data !== null && "pages" in data) {
      const pages = (data as { pages: unknown[] }).pages;
      for (const page of pages) {
        if (!page || typeof page !== "object" || !("items" in page)) continue;
        const items = (page as { items: unknown[] }).items;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          const row = rowFromUnknown(item);
          if (row?.id === transactionId) return row;
        }
      }
      continue;
    }

    if (
      typeof data === "object" &&
      data !== null &&
      "recent_transactions" in data
    ) {
      const recent = (data as { recent_transactions: unknown[] })
        .recent_transactions;
      if (!Array.isArray(recent)) continue;
      for (const item of recent) {
        const row = rowFromUnknown(item);
        if (row?.id === transactionId) return row;
      }
      continue;
    }
  }

  return null;
}
