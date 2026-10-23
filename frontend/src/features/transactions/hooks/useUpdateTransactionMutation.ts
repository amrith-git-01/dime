import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import {
  updateTransaction,
  type UpdateTransactionBody,
} from "../api/transactionsApi";
import {
  invalidateTransactionAggregates,
  invalidateTransactionDerivedQueries,
} from "../cache/invalidateTransactionQueries";
import { applyTransactionUpdateToListCaches } from "../cache/transactionListCache";
import { transactionsQueryKeys } from "../queryKeys";
import { recentTransactionMutations } from "../utils/recentMutationTracker";

export type UpdateTransactionVariables = {
  id: string;
  body: UpdateTransactionBody;
};

export function useUpdateTransactionMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    mutationFn: async ({ id, body }: UpdateTransactionVariables) => {
      // Realtime echoes this change back; the cache update below already covers it.
      recentTransactionMutations.mark(id);
      try {
        return await updateTransaction(id, body);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (row, { id }) => {
      recentTransactionMutations.mark(id);
      if (row && userId) {
        // The PATCH answers with the saved row: patch the lists and the open detail, refetch only the totals.
        applyTransactionUpdateToListCaches(qc, {
          userId,
          timezone: getDeviceIanaTimezone(),
          row,
        });
        qc.setQueryData(transactionsQueryKeys.detail(userId, id), row);
        invalidateTransactionAggregates(qc);
        return;
      }
      invalidateTransactionDerivedQueries(qc);
    },
  });
}
