import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { realtimeClient } from "@/lib/realtime";

import { invalidateCategoryDerivedQueries } from "../cache/invalidateCategoryQueries";

export function useCategoriesRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const invalidate = () => invalidateCategoryDerivedQueries(queryClient);

    // Changes made while the socket was down were never delivered: onResync refetches.
    return realtimeClient.subscribe({
      table: "categories",
      onChange: invalidate,
      onResync: invalidate,
    });
  }, [queryClient, userId]);
}
