import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAppTourStore } from "@/features/appTour/store/appTourStore";
import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import { invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";
import { createIdempotencyKeyCache } from "@/features/transactions/utils/idempotencyKeyCache";

export type SubmitManualTransactionVariables = {
  body: CreateTransactionBody;
};

export function useSubmitManualTransactionMutation() {
  const qc = useQueryClient();
  const [idempotencyKeys] = useState(createIdempotencyKeyCache);

  return useMutation({
    mutationFn: async ({ body }: SubmitManualTransactionVariables) => {
      await submitManualTransaction(body, idempotencyKeys.keyFor(body));
    },
    onSuccess: () => {
      idempotencyKeys.clear();
      invalidateTransactionDerivedQueries(qc);
      // Store-level on purpose: the tour overlay is not mounted while the add form is open.
      useAppTourStore.getState().onTransactionSaved();
    },
  });
}
