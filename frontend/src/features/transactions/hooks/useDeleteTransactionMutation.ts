import { useMutation, useQueryClient } from "@tanstack/react-query";

import { parseFastApiError } from "@/lib/api/parseFastApiError";

import { deleteTransaction } from "../api/transactionsApi";

export function useDeleteTransactionMutation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteTransaction(id);
      } catch (error) {
        throw new Error(parseFastApiError(error));
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ refetchType: "active" });
    },
  });
}
