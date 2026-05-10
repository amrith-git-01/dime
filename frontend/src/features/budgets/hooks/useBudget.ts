import { fetchBudget, upsertBudget } from "@/features/budgets/api/budgetsApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const budgetQueryKey = ["budget"] as const;

export function useBudgetQuery() {
  return useQuery({ queryKey: budgetQueryKey, queryFn: fetchBudget, staleTime: 60_000 });
}

export function useUpsertBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: number }) => upsertBudget(input),
    onSuccess: () => qc.invalidateQueries(budgetQueryKey),
  });
}
