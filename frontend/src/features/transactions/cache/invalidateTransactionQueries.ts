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

/** The `transactions` query groups that totals or filters are computed from; plain month pages and detail are patched in place instead. */
const AGGREGATE_TRANSACTION_GROUPS: ReadonlySet<unknown> = new Set([
  "home",
  "monthSummary",
  "filteredMonthPages",
  "rangePages",
]);

/**
 * Like `invalidateTransactionDerivedQueries`, minus the unfiltered month pages and the detail
 * query: use it after a write whose row was already patched into those caches
 * (`applyTransaction*ToListCaches`, the detail `setQueryData`). Everything that cannot be patched
 * cheaply still refetches: home totals, month summary, filtered / range lists, insights,
 * recurring, payee suggestions, notifications and onboarding progress.
 */
export function invalidateTransactionAggregates(
  queryClient: QueryClient,
): void {
  void queryClient.invalidateQueries({
    queryKey: transactionsQueryKeys.all,
    predicate: (query) => AGGREGATE_TRANSACTION_GROUPS.has(query.queryKey[1]),
  });
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: recurringQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: payeesQueryKeys.suggestionsAll });
  void queryClient.invalidateQueries({
    queryKey: notificationQueryKeys.all,
  });
  invalidateOnboardingProgress(queryClient);
}
