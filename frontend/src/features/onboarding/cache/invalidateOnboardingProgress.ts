import type { QueryClient } from "@tanstack/react-query";

import { onboardingQueryKeys } from "../queryKeys";

/** After anything that can tick a "Get started" item: an expense, a budget, a recurring item, an agent answer. */
export function invalidateOnboardingProgress(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.all });
}
