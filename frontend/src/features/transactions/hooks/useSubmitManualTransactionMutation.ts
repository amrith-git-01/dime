import { useMutation, useQueryClient } from "@tanstack/react-query";

import { submitManualTransaction } from "@/features/transactions/api/submitTransactionApi";
import type { CreateTransactionBody } from "@/features/transactions/api/transactionsApi";
import {
  applyOptimisticManualTransaction,
  buildOptimisticTransactionRow,
  rollbackOptimisticManualTransaction,
  type ManualTransactionOptimisticMeta,
  type OptimisticManualTransactionContext,
} from "@/features/transactions/optimistic/manualTransactionCache";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

export type SubmitManualTransactionVariables = {
  body: CreateTransactionBody;
  categoryMeta: ManualTransactionOptimisticMeta;
};

export function useSubmitManualTransactionMutation() {
  const queryClient = useQueryClient();
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();

  return useMutation({
    mutationFn: ({ body }: SubmitManualTransactionVariables) =>
      submitManualTransaction(body),
    onMutate: async (
      variables,
    ): Promise<OptimisticManualTransactionContext | undefined> => {
      if (!userId) {
        return undefined;
      }
      const row = buildOptimisticTransactionRow(
        userId,
        variables.body,
        variables.categoryMeta,
      );
      return applyOptimisticManualTransaction(queryClient, {
        userId,
        timezone,
        row,
      });
    },
    onError: (_error, _variables, context) => {
      rollbackOptimisticManualTransaction(queryClient, context);
    },
  });
}
