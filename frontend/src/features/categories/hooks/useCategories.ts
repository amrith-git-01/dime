import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchCategories } from "../api/categoriesApi";
import { categoriesQueryKeys } from "../queryKeys";
import type { CategoryScope } from "../types";
import { sortCategories } from "../utils/sortCategories";

/** React Query hook — sorted list of one scope (spend by default), MMKV-persisted via app-level persister. */
export function useCategoriesQuery(scope: CategoryScope = "spend") {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: categoriesQueryKeys.list(userId, scope),
    queryFn: () => fetchCategories(scope),
    enabled: Boolean(userId),
    select: sortCategories,
  });
}

/** Screen-facing categories list with MMKV-friendly loading semantics. */
export function useCategories(scope: CategoryScope = "spend") {
  const { data, isPending } = useCategoriesQuery(scope);

  return {
    categories: data ?? [],
    isLoading: isPending && data === undefined,
  };
}
