import { useQuery } from "@tanstack/react-query";

import { isTourSampleId } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchTransactionById } from "../api/transactionsApi";
import { isOptimisticTransactionId } from "../optimistic/optimisticTransactionId";
import { transactionsQueryKeys } from "../queryKeys";
import type { TransactionRow } from "../types";

/**
 * Detail view of one transaction. The row passed through navigation seeds the cache, but it is
 * treated as stale so opening the screen always refetches (signed receipt/voice URLs expire).
 * If the refetch fails the seeded row stays on screen. Optimistic rows and the guided tour's
 * sample rows are not on the server, so they never refetch.
 */
export function useTransactionDetailQuery(initial: TransactionRow) {
  const { userId } = useSessionUserId();
  // A sample row never enters the cache, not even as a seed or inside a key (the caller falls
  // back to the row it was given).
  const sample = isTourSampleId(initial.id);

  return useQuery({
    queryKey: transactionsQueryKeys.detail(
      userId,
      sample ? "tour-sample" : initial.id,
    ),
    queryFn: () => fetchTransactionById(initial.id),
    initialData: sample ? undefined : initial,
    initialDataUpdatedAt: 0,
    staleTime: 0,
    retry: false,
    enabled:
      Boolean(userId) &&
      !isOptimisticTransactionId(initial.id) &&
      !sample,
  });
}
