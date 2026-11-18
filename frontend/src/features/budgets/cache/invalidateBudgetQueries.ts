import type { QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";

/** The month views that carry the budget picture (cap, spent, left): Home and the month summary. */
const BUDGET_PICTURE_GROUPS: ReadonlySet<unknown> = new Set(["home", "monthSummary"]);

/**
 * After a budget or category-budget change (or anything that moves what counts toward the budget: a
 * recurring item's "counts toward budget" switch, the cash-withdrawal setting): Home and the month
 * summary carry the month's cap and "left", month insights embed the budget, and the server may have
 * raised (or stopped raising) budget alerts, which moves the unread badge. The "Get started" progress
 * follows too (a budget is one of its items).
 */
export function invalidateBudgetAlertQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: transactionsQueryKeys.all,
    predicate: (query) => BUDGET_PICTURE_GROUPS.has(query.queryKey[1]),
  });
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.unreadCountAll(),
  });
  invalidateOnboardingProgress(queryClient);
}
