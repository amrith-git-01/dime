import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  fetchBudget,
  upsertBudget,
  type UpsertBudgetInput,
} from "@/features/budgets/api/budgetsApi";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { budgetQueryKeys } from "../queryKeys";

export function useBudgetQuery(options?: { enabled?: boolean }) {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: budgetQueryKeys.current(userId),
    queryFn: fetchBudget,
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useUpsertBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBudgetInput) => upsertBudget(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: budgetQueryKeys.all });
    },
  });
}
