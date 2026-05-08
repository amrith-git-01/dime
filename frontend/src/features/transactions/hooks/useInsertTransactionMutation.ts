import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createTransaction,
  type CreateTransactionBody,
} from "../api/transactionsApi";
import { transactionsQueryKeys } from "../queryKeys";

export function useInsertTransactionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTransactionBody) => createTransaction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: transactionsQueryKeys.all,
        refetchType: "all",
      });
    },
  });
}
