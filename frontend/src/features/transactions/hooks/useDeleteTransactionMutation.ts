import { onlineManager, useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { isStaleError } from "@/lib/outbox/failure";
import { cancelPendingCreate, enqueueTransactionDelete } from "@/lib/outbox/outboxQueue";
import { sendOrQueue } from "@/lib/outbox/sendOrQueue";
import { formatInrCompact } from "@/utils/currency";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { deleteTransaction } from "../api/transactionsApi";
import { invalidateTransactionAggregates } from "../cache/invalidateTransactionQueries";
import { applyTransactionRemoveFromListCaches } from "../cache/transactionListCache";
import { transactionsQueryKeys } from "../queryKeys";
import type { TransactionRow } from "../types";
import { recentTransactionMutations } from "../utils/recentMutationTracker";
import { TransactionStaleError } from "../utils/staleError";

/** A delete waits this long for the server, then goes to the outbox. */
export const DELETE_TIMEOUT_MS = 10_000;

export type DeleteTransactionVariables = {
  id: string;
  /** The `updated_at` the user last saw: a row changed on another device meanwhile is a 409 `stale`, not a delete. */
  expectedUpdatedAt?: string | null;
  /** The row being deleted, for the Pending list label when the delete has to wait. */
  row?: TransactionRow;
};

/** `queued`: removed here, it syncs when the server can be reached; `outboxId` is what Undo discards. */
export type DeleteTransactionResult =
  | { status: "sent" }
  | { status: "queued"; outboxId: string };

export function useDeleteTransactionMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    networkMode: "always",
    mutationFn: async ({
      id,
      expectedUpdatedAt = null,
      row,
    }: DeleteTransactionVariables): Promise<DeleteTransactionResult> => {
      let outboxId = "";
      try {
        // An entry that has not been created yet has nothing to delete on the server: cancel the waiting create.
        const pendingCreate = userId ? cancelPendingCreate(userId, id) : null;
        if (pendingCreate === "syncing") {
          throw new Error("This entry is being saved right now. Try again in a moment.");
        }
        if (pendingCreate === "cancelled") {
          return { status: "sent" };
        }
        const outcome = await sendOrQueue({
          isOnline: () => onlineManager.isOnline(),
          send: () => deleteTransaction(id, { timeout: DELETE_TIMEOUT_MS, expectedUpdatedAt }),
          queue: () => {
            if (!userId) {
              throw new Error("Sign in to delete this transaction.");
            }
            outboxId = enqueueTransactionDelete({
              userId,
              targetId: id,
              expectedUpdatedAt,
              label: row ? `Delete ${formatInrCompact(row.amount)} · ${row.merchant}` : "Delete",
            }).id;
          },
        });
        return outcome.status === "sent" ? { status: "sent" } : { status: "queued", outboxId };
      } catch (error) {
        if (isStaleError(error)) {
          throw new TransactionStaleError();
        }
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (result, { id }) => {
      // Realtime echoes the removal back; the cache update below already covers it.
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
      if (result.status === "sent") {
        invalidateTransactionAggregates(qc);
      }
    },
  });
}
