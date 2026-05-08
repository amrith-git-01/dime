import { useSessionUserId } from "@/hooks/useSessionUserId";

import { useCategoriesQuery } from "../hooks/useCategoriesQuery";
import { useCategoriesRealtimeSync } from "../hooks/useCategoriesRealtimeSync";

export function CategoriesSyncBootstrap() {
  const { userId } = useSessionUserId();
  useCategoriesQuery();
  useCategoriesRealtimeSync(userId ?? null);
  return null;
}
