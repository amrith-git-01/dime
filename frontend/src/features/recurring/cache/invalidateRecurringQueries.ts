import type { QueryClient } from "@tanstack/react-query";

import { invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";

import { recurringQueryKeys } from "../queryKeys";

/**
 * After a recurring item is created, edited or deleted: the lists and Home's Upcoming card, and
 * (creating can post this period's transaction) transactions, Home and insights.
 */
export function invalidateRecurringQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: recurringQueryKeys.all });
  invalidateTransactionDerivedQueries(queryClient);
}
