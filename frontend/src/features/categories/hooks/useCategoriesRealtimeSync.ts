import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase/client";

import { categoriesQueryKeys } from "../queryKeys";

export function useCategoriesRealtimeSync(userId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) {
      return;
    }

    const invalidate = () => {
      void queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.all,
        refetchType: "all",
      });
    };

    const channel = supabase
      .channel("categories:global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}
