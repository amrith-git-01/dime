import { useMutation, useQueryClient } from "@tanstack/react-query";

import { parseFastApiError } from "@/lib/api/parseFastApiError";

import {
  updateTransaction,
  type UpdateTransactionBody,
} from "../api/transactionsApi";
import { invalidateTransactionDerivedQueries } from "../cache/invalidateTransactionQueries";
import { recentTransactionMutations } from "../utils/recentMutationTracker";

export type UpdateTransactionVariables = {
  id: string;
  body: UpdateTransactionBody;
};

export function useUpdateTransactionMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: UpdateTransactionVariables) => {
      // Realtime echoes this change back; the invalidation below already covers it.
      recentTransactionMutations.mark(id);
      try {
        await updateTransaction(id, body);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (_data, { id }) => {
      recentTransactionMutations.mark(id);
      invalidateTransactionDerivedQueries(qc);
    },
  });
}
