import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchLimits } from "../api/limitsApi";
import { invalidateLimitsQueries } from "../cache/invalidateLimitsQueries";
import { limitsQueryKeys } from "../queryKeys";

/** Counters move with every action; keep them short-lived (refetches on app foreground). */
export const LIMITS_STALE_MS = 30 * 1000;

/** setTimeout cannot exceed a signed 32-bit delay. */
const MAX_TIMER_MS = 2_147_483_647;
/** Small grace so the server has rolled over by the time we refetch. */
const RESET_GRACE_MS = 1000;

/** Today's limits. Refetches when the app returns to the foreground and right after `resets_at`. */
export function useLimitsQuery() {
  const { userId } = useSessionUserId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: limitsQueryKeys.current(userId),
    queryFn: fetchLimits,
    enabled: Boolean(userId),
    staleTime: LIMITS_STALE_MS,
  });

  const resetsAt = query.data?.resets_at;
  useEffect(() => {
    if (!resetsAt) {
      return;
    }
    const target = Date.parse(resetsAt);
    if (!Number.isFinite(target)) {
      return;
    }
    const delay = Math.min(
      Math.max(target - Date.now(), 0) + RESET_GRACE_MS,
      MAX_TIMER_MS,
    );
    const timer = setTimeout(() => invalidateLimitsQueries(queryClient), delay);
    return () => clearTimeout(timer);
  }, [queryClient, resetsAt]);

  return query;
}
