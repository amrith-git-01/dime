import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { prefetchAppQueries } from "@/lib/prefetchAppQueries";
import { readStoredAuthSession } from "@/lib/supabase/mmkvAuthStorage";

/**
 * Waits for the MMKV → React Query hydrate, then pre-warms tab queries in the
 * background. Splash should stay visible until `cacheReady` is true.
 */
export function useAppStartupBootstrap(): { cacheReady: boolean } {
  const isRestoring = useIsRestoring();
  const queryClient = useQueryClient();
  const prefetchedRef = useRef(false);

  useEffect(() => {
    if (isRestoring || prefetchedRef.current) {
      return;
    }

    const userId = readStoredAuthSession()?.user.id;
    if (!userId) {
      return;
    }

    prefetchedRef.current = true;
    prefetchAppQueries(queryClient, userId);
  }, [isRestoring, queryClient]);

  return { cacheReady: !isRestoring };
}
