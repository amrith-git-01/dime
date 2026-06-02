import { useQuery } from "@tanstack/react-query";

import { fetchCategoryDeleteImpact } from "../api/categoryDeleteApi";
import { categoriesQueryKeys } from "../queryKeys";

const DELETE_IMPACT_STALE_MS = 60_000;

export function useCategoryDeleteImpactQuery(
  categoryId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: categoriesQueryKeys.deleteImpact(categoryId),
    queryFn: () => fetchCategoryDeleteImpact(categoryId),
    enabled: options?.enabled ?? true,
    staleTime: DELETE_IMPACT_STALE_MS,
  });
}
