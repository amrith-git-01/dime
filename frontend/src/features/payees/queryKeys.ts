import type { TransactionType } from "@/features/transactions/types";

export const payeesQueryKeys = {
  all: ["payees"] as const,
  brandSearch: (userId: string | undefined, q: string) =>
    [...payeesQueryKeys.all, "brands", userId ?? "none", q] as const,
  /** Prefix of every suggestion query, for invalidation after a transaction changes. */
  suggestionsAll: ["payees", "suggestions"] as const,
  suggestions: (
    userId: string | undefined,
    type: TransactionType,
    q: string,
    limit: number,
  ) =>
    [
      ...payeesQueryKeys.suggestionsAll,
      userId ?? "none",
      type,
      q,
      limit,
    ] as const,
};
