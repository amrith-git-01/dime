import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";

export type SubmitManualTransactionVariables = {
  body: CreateTransactionBody;
};

export function useSubmitManualTransactionMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ body }: SubmitManualTransactionVariables) =>
      submitManualTransaction(body),
    onSuccess: () => {
      void qc.invalidateQueries({ refetchType: "active" });
    },
  });
}
