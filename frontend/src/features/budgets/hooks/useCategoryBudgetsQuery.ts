import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchCategoryBudgets } from "../api/categoryBudgetsApi";
import { categoryBudgetsQueryKeys } from "../queryKeys";

export function useCategoryBudgetsQuery() {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: categoryBudgetsQueryKeys.list(userId),
    queryFn: fetchCategoryBudgets,
  });
}
