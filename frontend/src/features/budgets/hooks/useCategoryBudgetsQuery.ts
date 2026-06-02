import { useQuery } from "@tanstack/react-query";

import { fetchCategoryBudgets } from "../api/categoryBudgetsApi";

export const categoryBudgetsQueryKey = ["categoryBudgets"] as const;

export function useCategoryBudgetsQuery() {
  return useQuery({
    queryKey: categoryBudgetsQueryKey,
    queryFn: fetchCategoryBudgets,
    staleTime: 60_000,
  });
}
