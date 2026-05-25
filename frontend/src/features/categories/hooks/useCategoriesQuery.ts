import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchCategories } from "../api/categoriesApi";
import { categoriesQueryKeys } from "../queryKeys";

export function useCategoriesQuery() {
  const { userId, authReady } = useSessionUserId();

  return useQuery({
    queryKey: categoriesQueryKeys.list(),
    queryFn: () => fetchCategories(),
    enabled: authReady && Boolean(userId),
  });
}
