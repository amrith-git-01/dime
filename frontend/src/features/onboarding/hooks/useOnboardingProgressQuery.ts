import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";

import { fetchOnboardingProgress } from "../api/onboardingProgressApi";
import { onboardingQueryKeys } from "../queryKeys";

/** Changes only through the user's own actions, which invalidate it; a short stale time covers actions on other devices. */
export const ONBOARDING_PROGRESS_STALE_MS = 60 * 1000;

/** Which "Get started" items the user has done (kept in memory only: see `lib/queryCachePolicy.ts`). */
export function useOnboardingProgressQuery(options?: { enabled?: boolean }) {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: onboardingQueryKeys.progress(userId),
    queryFn: fetchOnboardingProgress,
    enabled: Boolean(userId) && (options?.enabled ?? true),
    staleTime: ONBOARDING_PROGRESS_STALE_MS,
  });
}
