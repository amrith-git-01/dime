import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { discardOutboxItem } from "@/lib/outbox/outboxQueue";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { restoreTransaction } from "../api/transactionsApi";
import {
  invalidateTransactionAggregates,
  invalidateTransactionDerivedQueries,
} from "../cache/invalidateTransactionQueries";
import { applyTransactionInsertToListCaches } from "../cache/transactionListCache";
import { recentTransactionMutations } from "../utils/recentMutationTracker";

export type RestoreTransactionVariables = {
  id: string;
  /** Set when the delete never reached the server: Undo just throws the queued delete away. */
  queuedDeleteOutboxId?: string;
};

/** The "Undo" of a delete: the row comes back with its paybacks and the budget it counted toward. */
export function useRestoreTransactionMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    mutationFn: async ({ id, queuedDeleteOutboxId }: RestoreTransactionVariables) => {
      if (queuedDeleteOutboxId) {
        discardOutboxItem(queuedDeleteOutboxId);
        return undefined;
      }
      try {
        return await restoreTransaction(id);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (row) => {
      if (row && userId) {
        recentTransactionMutations.mark(row.id, row.updated_at);
        applyTransactionInsertToListCaches(qc, { userId, timezone: getDeviceIanaTimezone(), row });
        invalidateTransactionAggregates(qc);
        return;
      }
      // A queued delete was discarded (or an older server answered no row): refetch what was shown.
      invalidateTransactionDerivedQueries(qc);
    },
  });
}
