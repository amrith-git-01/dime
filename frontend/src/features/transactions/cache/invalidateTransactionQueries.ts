import type { QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";

import { transactionsQueryKeys } from "../queryKeys";

/**
 * Refreshes everything derived from the transactions table: list/home/month-summary/detail
 * queries, month insights, and the notification badge (budget alerts are raised server-side).
 * Only active queries refetch now; inactive ones are marked stale and refetch when next used.
 */
export function invalidateTransactionDerivedQueries(
  queryClient: QueryClient,
): void {
  void queryClient.invalidateQueries({ queryKey: transactionsQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.unreadCount(),
  });
}
