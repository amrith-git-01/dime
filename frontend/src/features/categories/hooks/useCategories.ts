import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchCategories } from "../api/categoriesApi";
import { categoriesQueryKeys } from "../queryKeys";
import { sortCategories } from "../utils/sortCategories";

/** React Query hook — sorted list, MMKV-persisted via app-level persister. */
export function useCategoriesQuery() {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: categoriesQueryKeys.list(userId),
    queryFn: fetchCategories,
    enabled: Boolean(userId),
    select: sortCategories,
  });
}

/** Screen-facing categories list with MMKV-friendly loading semantics. */
export function useCategories() {
  const { data, isPending } = useCategoriesQuery();

  return {
    categories: data ?? [],
    isLoading: isPending && data === undefined,
  };
}
