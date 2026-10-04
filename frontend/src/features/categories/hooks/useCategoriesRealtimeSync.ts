import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase/client";
import { createResubscribeHandler } from "@/lib/supabase/realtimeResubscribe";

import { invalidateCategoryDerivedQueries } from "../cache/invalidateCategoryQueries";

export function useCategoriesRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const invalidate = () => invalidateCategoryDerivedQueries(queryClient);

    const channel = supabase
      .channel(`categories:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "categories",
          filter: `user_id=eq.${userId}`,
        },
        invalidate,
      )
      // Changes made while the socket was down were never delivered.
      .subscribe(createResubscribeHandler(invalidate));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
