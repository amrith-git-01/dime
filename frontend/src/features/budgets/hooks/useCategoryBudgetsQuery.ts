import { useQuery } from "@tanstack/react-query";

import { usePreviewable } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchCategoryBudgets } from "../api/categoryBudgetsApi";
import { categoryBudgetsQueryKeys } from "../queryKeys";

export function useCategoryBudgetsQuery() {
  const { userId } = useSessionUserId();

  const query = useQuery({
    queryKey: categoryBudgetsQueryKeys.list(userId),
    queryFn: fetchCategoryBudgets,
  });
  return usePreviewable(query, (sample) => sample.categoryBudgets);
}
