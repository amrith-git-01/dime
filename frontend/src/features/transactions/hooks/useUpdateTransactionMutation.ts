import { onlineManager, useMutation, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { parseFastApiError } from "@/lib/api/parseFastApiError";
import { isStaleError } from "@/lib/outbox/failure";
import { editPendingCreate, enqueueTransactionUpdate } from "@/lib/outbox/outboxQueue";
import { sendOrQueue } from "@/lib/outbox/sendOrQueue";
import { formatInrCompact } from "@/utils/currency";
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
import type { TransactionRow } from "../types";
import { recentTransactionMutations } from "../utils/recentMutationTracker";
import { TransactionStaleError } from "../utils/staleError";
import { applyPatchToRow } from "../utils/transactionPatch";

/** A save waits this long for the server, then the edit goes to the outbox (the row's `updated_at` guards the replay). */
export const UPDATE_TIMEOUT_MS = 10_000;

export type UpdateTransactionVariables = {
  id: string;
  /** Only the changed fields, with the `expected_updated_at` they were made against. */
  body: UpdateTransactionBody;
  /** The row as the edit started from; lets an edit saved offline show in the lists until it syncs. */
  original?: TransactionRow;
};

/**
 * `queued`: saved on this device, it syncs when the server can be reached. `pendingCreate`: the row is itself still
 * waiting to be created, so the edit went into that waiting entry (there is no saved row to patch in the caches).
 */
export type UpdateTransactionResult =
  | { status: "sent"; row: TransactionRow | undefined }
  | { status: "queued"; pendingCreate?: true };

function queuedLabel(original: TransactionRow | undefined, body: UpdateTransactionBody): string {
  const row = original ? applyPatchToRow(original, body) : undefined;
  return row ? `Edit ${formatInrCompact(row.amount)} · ${row.merchant}` : "Edit";
}

export function useUpdateTransactionMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();

  return useMutation({
    // Offline is handled by the mutation itself (it queues the edit); the default mode would pause it.
    networkMode: "always",
    mutationFn: async ({
      id,
      body,
      original,
    }: UpdateTransactionVariables): Promise<UpdateTransactionResult> => {
      try {
        // An entry that has not been created yet has no server row: the edit joins the waiting create.
        const pendingCreate = userId ? editPendingCreate({ userId, targetId: id, patch: body }) : null;
        if (pendingCreate === "syncing") {
          throw new Error("This entry is being saved right now. Try again in a moment.");
        }
        if (pendingCreate === "edited") {
          return { status: "queued", pendingCreate: true };
        }
        const outcome = await sendOrQueue({
          isOnline: () => onlineManager.isOnline(),
          send: () => updateTransaction(id, body, { timeout: UPDATE_TIMEOUT_MS }),
          queue: () => {
            if (!userId) {
              throw new Error("Sign in to save this transaction.");
            }
            enqueueTransactionUpdate({
              userId,
              targetId: id,
              patch: body,
              label: queuedLabel(original, body),
            });
          },
        });
        return outcome.status === "sent"
          ? { status: "sent", row: outcome.value }
          : { status: "queued" };
      } catch (error) {
        if (isStaleError(error)) {
          throw new TransactionStaleError();
        }
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: (result, { id, body, original }) => {
      if (result.status === "queued") {
        // Show the edit now; the totals follow once it syncs (a waiting entry is drawn from the outbox itself).
        if (original && userId && !result.pendingCreate) {
          const row = applyPatchToRow(original, body);
          applyTransactionUpdateToListCaches(qc, { userId, timezone: getDeviceIanaTimezone(), row });
          qc.setQueryData(transactionsQueryKeys.detail(userId, id), row);
        }
        return;
      }
      const { row } = result;
      if (row && userId) {
        // Realtime echoes this change back (same `updated_at`); the cache update below already covers it.
        recentTransactionMutations.mark(id, row.updated_at);
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
      recentTransactionMutations.mark(id);
      invalidateTransactionDerivedQueries(qc);
    },
  });
}
