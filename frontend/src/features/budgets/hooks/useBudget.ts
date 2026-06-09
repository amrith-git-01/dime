import {
  fetchBudget,
  upsertBudget,
  type UpsertBudgetInput,
} from "@/features/budgets/api/budgetsApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const budgetQueryKey = ["budget"] as const;

export function useBudgetQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: budgetQueryKey,
    queryFn: fetchBudget,
    enabled: options?.enabled ?? true,
  });
}

export function useUpsertBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertBudgetInput) => upsertBudget(input),
    onSuccess: () => {
      void qc.invalidateQueries({ refetchType: "active" });
    },
  });
}
