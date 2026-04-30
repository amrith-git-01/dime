import { useEffect } from "react";

import { upsertCategoriesFromApi } from "@/db/categoriesRepo";
import { useCategoriesQuery } from "@/features/categories/hooks/useCategoriesQuery";
import { useCategoriesRealtimeSync } from "@/features/categories/hooks/useCategoriesRealtimeSync";
import { useSessionUserId } from "@/hooks/useSessionUserId";

/** Syncs categories from API + realtime into local DB (no UI). */
export function useCategoriesSyncBootstrap(): void {
  const { userId } = useSessionUserId();
  const categoriesQuery = useCategoriesQuery();
  useCategoriesRealtimeSync(userId ?? null);

  useEffect(() => {
    if (!categoriesQuery.data) {
      return;
    }
    void upsertCategoriesFromApi(categoriesQuery.data);
  }, [categoriesQuery.data]);
}
