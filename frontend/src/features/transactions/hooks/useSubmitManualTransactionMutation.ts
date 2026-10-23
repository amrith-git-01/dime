import { onlineManager, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAppTourStore } from "@/features/appTour/store/appTourStore";
import {
  submitManualTransaction,
  type PostedManualTransaction,
} from "@/features/transactions/api/submitTransactionApi";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import {
  invalidateTransactionAggregates,
  invalidateTransactionDerivedQueries,
} from "@/features/transactions/cache/invalidateTransactionQueries";
import { applyTransactionInsertToListCaches } from "@/features/transactions/cache/transactionListCache";
import { createIdempotencyKeyCache } from "@/features/transactions/utils/idempotencyKeyCache";
import { recentTransactionMutations } from "@/features/transactions/utils/recentMutationTracker";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { enqueueManualTransaction } from "@/lib/outbox/outboxQueue";
import type { OutboxManualPreview } from "@/lib/outbox/outboxTypes";
import { sendOrQueue } from "@/lib/outbox/sendOrQueue";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

/**
 * A save never hangs the form: online it waits this long for the server, then the entry goes to the
 * outbox (same idempotency key, so a request that did land is not duplicated when it is replayed).
 */
export const MANUAL_SAVE_TIMEOUT_MS = 10_000;

export type SubmitManualTransactionVariables = {
  body: CreateTransactionBody;
  /** How the entry looks in lists while it waits in the outbox. */
  preview: OutboxManualPreview;
};

/** `queued`: saved on this device, it syncs when the server can be reached. */
export type SubmitManualTransactionResult =
  | { status: "sent"; posted: PostedManualTransaction }
  | { status: "queued" };

export function useSubmitManualTransactionMutation() {
  const qc = useQueryClient();
  const { userId } = useSessionUserId();
  const [idempotencyKeys] = useState(createIdempotencyKeyCache);

  return useMutation({
    // Offline is handled by the mutation itself (it queues the entry). The default "online" mode would
    // pause it until the connection is back, and the form would hang.
    networkMode: "always",
    mutationFn: async ({
      body,
      preview,
    }: SubmitManualTransactionVariables): Promise<SubmitManualTransactionResult> => {
      if (!userId) {
        throw new Error("Sign in to add a transaction.");
      }
      const idempotencyKey = idempotencyKeys.keyFor(body);
      const outcome = await sendOrQueue({
        isOnline: () => onlineManager.isOnline(),
        send: () =>
          submitManualTransaction(body, idempotencyKey, {
            timeout: MANUAL_SAVE_TIMEOUT_MS,
          }),
        queue: () => {
          enqueueManualTransaction({ userId, body, preview, idempotencyKey });
        },
      });
      return outcome.status === "sent"
        ? { status: "sent", posted: outcome.value }
        : { status: "queued" };
    },
    onSuccess: (result) => {
      idempotencyKeys.clear();
      if (result.status === "sent") {
        const row = result.posted.transaction;
        if (row && userId) {
          // The server echoes the saved row: patch the lists, refetch only the totals.
          recentTransactionMutations.mark(row.id);
          applyTransactionInsertToListCaches(qc, {
            userId,
            timezone: getDeviceIanaTimezone(),
            row,
          });
          invalidateTransactionAggregates(qc);
        } else {
          // An older server answers without the row.
          invalidateTransactionDerivedQueries(qc);
        }
      }
      // Store-level on purpose: the tour overlay is not mounted while the add form is open.
      useAppTourStore.getState().onTransactionSaved();
    },
  });
}
