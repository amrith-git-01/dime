import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import { invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";
import { createIdempotencyKeyCache } from "@/features/transactions/utils/idempotencyKeyCache";
import {
  OWN_CREATE_MARKER,
  recentTransactionMutations,
} from "@/features/transactions/utils/recentMutationTracker";

export type SubmitManualTransactionVariables = {
  body: CreateTransactionBody;
};

export function useSubmitManualTransactionMutation() {
  const qc = useQueryClient();
  const [idempotencyKeys] = useState(createIdempotencyKeyCache);

  return useMutation({
    mutationFn: async ({ body }: SubmitManualTransactionVariables) => {
      // The insert's realtime INSERT can land before the response; onSuccess below already
      // refreshes the caches, so that echo must not trigger a second refetch wave.
      recentTransactionMutations.mark(OWN_CREATE_MARKER);
      await submitManualTransaction(body, idempotencyKeys.keyFor(body));
    },
    onSuccess: () => {
      recentTransactionMutations.mark(OWN_CREATE_MARKER);
      idempotencyKeys.clear();
      invalidateTransactionDerivedQueries(qc);
    },
  });
}
