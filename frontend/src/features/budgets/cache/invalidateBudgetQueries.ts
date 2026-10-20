import type { QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";

/**
 * After a budget or category-budget change: month insights embed the budget, and the server
 * may have raised (or stopped raising) budget alerts, which moves the unread badge. The "Get started"
 * progress follows too (a budget is one of its items).
 */
export function invalidateBudgetAlertQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.unreadCountAll(),
  });
  invalidateOnboardingProgress(queryClient);
}
