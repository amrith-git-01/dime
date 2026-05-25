import { useEffect } from "react";

import { upsertCategoriesFromApi } from "@/db/categoriesRepo";
import { useSessionUserId } from "@/hooks/useSessionUserId";

import { useCategoriesQuery } from "../hooks/useCategoriesQuery";
import { useCategoriesRealtimeSync } from "../hooks/useCategoriesRealtimeSync";

export function CategoriesSyncBootstrap() {
  const { userId } = useSessionUserId();
  const categoriesQuery = useCategoriesQuery();
  useCategoriesRealtimeSync(userId ?? null);

  useEffect(() => {
    if (!categoriesQuery.data) {
      return;
    }
    void upsertCategoriesFromApi(categoriesQuery.data);
  }, [categoriesQuery.data]);

  return null;
}
