import type { QueryClient } from "@tanstack/react-query";

import { limitsQueryKeys } from "../queryKeys";

/** After a receipt/voice upload or an agent question: today's counters moved. */
export function invalidateLimitsQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: limitsQueryKeys.all });
}
