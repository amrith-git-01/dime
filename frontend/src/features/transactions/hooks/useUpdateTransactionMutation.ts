import { useMutation, useQueryClient } from "@tanstack/react-query";

import { parseFastApiError } from "@/lib/api/parseFastApiError";

import {
  updateTransaction,
  type UpdateTransactionBody,
} from "../api/transactionsApi";

export type UpdateTransactionVariables = {
  id: string;
  body: UpdateTransactionBody;
};

export function useUpdateTransactionMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: UpdateTransactionVariables) => {
      try {
        await updateTransaction(id, body);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ refetchType: "active" });
    },
  });
}
