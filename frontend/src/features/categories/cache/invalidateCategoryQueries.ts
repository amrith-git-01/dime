import type { QueryClient } from "@tanstack/react-query";

import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { categoryBudgetsQueryKeys } from "@/features/budgets/queryKeys";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";

import { categoriesQueryKeys } from "../queryKeys";

/**
 * Refreshes everything that embeds category name/icon/colour or groups by category: the
 * category list (including delete-impact queries), category budgets, transaction rows and
 * summaries, and month insights. Only active queries refetch now; inactive ones are marked stale.
 */
export function invalidateCategoryDerivedQueries(
  queryClient: QueryClient,
): void {
  void queryClient.invalidateQueries({ queryKey: categoriesQueryKeys.all });
  void queryClient.invalidateQueries({
    queryKey: categoryBudgetsQueryKeys.all,
  });
  void queryClient.invalidateQueries({ queryKey: transactionsQueryKeys.all });
  void queryClient.invalidateQueries({ queryKey: insightsQueryKeys.all });
}
