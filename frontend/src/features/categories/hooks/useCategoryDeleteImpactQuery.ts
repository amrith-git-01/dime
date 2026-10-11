import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchCategoryDeleteImpact } from "../api/categoryDeleteApi";
import { categoriesQueryKeys } from "../queryKeys";

const DELETE_IMPACT_STALE_MS = 60_000;

export function useCategoryDeleteImpactQuery(
  categoryId: string,
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: categoriesQueryKeys.deleteImpact(userId, categoryId),
    queryFn: () => fetchCategoryDeleteImpact(categoryId),
    enabled: (options?.enabled ?? true) && Boolean(userId),
    staleTime: DELETE_IMPACT_STALE_MS,
  });
}
