import type { QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { invalidateOnboardingProgress } from "@/features/onboarding/cache/invalidateOnboardingProgress";
import { notificationQueryKeys } from "@/features/notifications/queryKeys";
import { payeesQueryKeys } from "@/features/payees/queryKeys";
import { recurringQueryKeys } from "@/features/recurring/queryKeys";

import { transactionsQueryKeys } from "../queryKeys";

/**
 * Refreshes everything derived from the transactions table: list/home/month-summary/detail
 * queries, month insights, the recurring paid / upcoming month view (a cron post or a delete changes it),
 * the user's own payee suggestions, the notification badge (budget alerts are raised server-side), and
 * the "Get started" progress (first expense, voice or scan, recurring postings).
 * Only active queries refetch now; inactive ones are marked stale and refetch when next used.
 */
export function invalidateTransactionDerivedQueries(
  queryClient: QueryClient,
): void {
  void queryClient.invalidateQueries({ queryKey: transactionsQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: recurringQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: payeesQueryKeys.suggestionsAll });
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.all,
  });
  invalidateOnboardingProgress(queryClient);
}
