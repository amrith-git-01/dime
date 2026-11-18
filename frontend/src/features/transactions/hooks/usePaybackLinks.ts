import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

import {
  createTransactionOffset,
  deleteTransactionOffset,
  fetchPaybackCandidates,
  fetchTransactionOffsets,
  type CreateOffsetBody,
} from "../api/offsetsApi";
import { invalidateTransactionDerivedQueries } from "../cache/invalidateTransactionQueries";
import { transactionsQueryKeys } from "../queryKeys";

/** The paybacks linked to one transaction. Off for a row that is not on the server (an outbox entry, a tour sample). */
export function useTransactionOffsetsQuery(transactionId: string, options?: { enabled?: boolean }) {
  const { userId } = useSessionUserId();
  return useQuery({
    queryKey: transactionsQueryKeys.offsets(userId, transactionId),
    queryFn: () => fetchTransactionOffsets(transactionId),
    enabled: (options?.enabled ?? true) && Boolean(userId),
  });
}

/** Rows this transaction could be linked to; fetched only while the picker is open. */
export function usePaybackCandidatesQuery(transactionId: string, options?: { enabled?: boolean }) {
  const { userId } = useSessionUserId();
  return useQuery({
    queryKey: transactionsQueryKeys.paybackCandidates(userId, transactionId),
    queryFn: () => fetchPaybackCandidates(transactionId),
    enabled: (options?.enabled ?? true) && Boolean(userId),
    // Candidates move with every add and link: never serve an old list.
    staleTime: 0,
  });
}

/**
 * A link changes both rows (`offset_total`, `effective_amount`), the spend of the debit's month, the budget left,
 * the budget alerts and any reminder one of them settled: everything derived from transactions is refetched.
 */
export function useCreateOffsetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateOffsetBody) => {
      try {
        await createTransactionOffset(body);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: () => invalidateTransactionDerivedQueries(qc),
  });
}

export function useDeleteOffsetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (offsetId: string) => {
      try {
        await deleteTransactionOffset(offsetId);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: () => invalidateTransactionDerivedQueries(qc),
  });
}
