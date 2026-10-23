import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { deleteTransaction } from "../api/transactionsApi";
import { invalidateTransactionAggregates } from "../cache/invalidateTransactionQueries";
import { applyTransactionRemoveFromListCaches } from "../cache/transactionListCache";
import { transactionsQueryKeys } from "../queryKeys";
import { recentTransactionMutations } from "../utils/recentMutationTracker";

export function useDeleteTransactionMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    mutationFn: async (id: string) => {
      // Realtime echoes this change back; the cache update below already covers it.
      recentTransactionMutations.mark(id);
      try {
        await deleteTransaction(id);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (_data, id) => {
      recentTransactionMutations.mark(id);
      if (userId) {
        applyTransactionRemoveFromListCaches(qc, {
          userId,
          timezone: getDeviceIanaTimezone(),
          transactionId: id,
        });
        // The open detail screen is on its way out; dropping its query now would make it refetch a 404.
        void qc.cancelQueries({
          queryKey: transactionsQueryKeys.detail(userId, id),
          exact: true,
        });
      }
      invalidateTransactionAggregates(qc);
    },
  });
}
