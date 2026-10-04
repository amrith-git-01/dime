import { useMutation, useQueryClient } from "@tanstack/react-query";

import { parseFastApiError } from "@/lib/api/parseFastApiError";

import { deleteTransaction } from "../api/transactionsApi";
import { invalidateTransactionDerivedQueries } from "../cache/invalidateTransactionQueries";
import { recentTransactionMutations } from "../utils/recentMutationTracker";

export function useDeleteTransactionMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Realtime echoes this change back; the invalidation below already covers it.
      recentTransactionMutations.mark(id);
      try {
        await deleteTransaction(id);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (_data, id) => {
      recentTransactionMutations.mark(id);
      invalidateTransactionDerivedQueries(qc);
    },
  });
}
