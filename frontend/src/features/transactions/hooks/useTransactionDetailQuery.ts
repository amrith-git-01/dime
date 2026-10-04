import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchTransactionById } from "../api/transactionsApi";
import { isOptimisticTransactionId } from "../optimistic/optimisticTransactionId";
import { transactionsQueryKeys } from "../queryKeys";
import type { TransactionRow } from "../types";

/**
 * Detail view of one transaction. The row passed through navigation seeds the cache, but it is
 * treated as stale so opening the screen always refetches (signed receipt/voice URLs expire).
 * If the refetch fails the seeded row stays on screen.
 */
export function useTransactionDetailQuery(initial: TransactionRow) {
  const { userId, authReady } = useSessionUserId();

  return useQuery({
    queryKey: transactionsQueryKeys.detail(userId, initial.id),
    queryFn: () => fetchTransactionById(initial.id),
    initialData: initial,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    retry: false,
    enabled:
      authReady && Boolean(userId) && !isOptimisticTransactionId(initial.id),
  });
}
