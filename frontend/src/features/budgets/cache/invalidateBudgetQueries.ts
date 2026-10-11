import type { QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";

/**
 * After a budget or category-budget change: month insights embed the budget, and the server
 * may have raised (or stopped raising) budget alerts, which moves the unread badge.
 */
export function invalidateBudgetAlertQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.unreadCountAll(),
  });
}
