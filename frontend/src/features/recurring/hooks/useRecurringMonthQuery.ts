import { useQuery } from "@tanstack/react-query";

import { isSampleMonth, usePreviewable } from "@/features/tourPreview";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { keepPreviousDataForUser } from "@/lib/keepPreviousDataForUser";
import { TRANSACTIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";

import { fetchRecurringMonth } from "../api/recurringApi";
import { recurringQueryKeys } from "../queryKeys";

/**
 * This month's recurring occurrences (paid / upcoming / skipped) with fixed-money totals.
 * `monthIndex0` is 0-11. Keeps the previous month on screen while the next one loads.
 */
export function useRecurringMonthQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();

  const query = useQuery({
    queryKey: recurringQueryKeys.month(userId, year, monthIndex0),
    queryFn: () => fetchRecurringMonth(year, monthIndex0),
    enabled: (options?.enabled ?? true) && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    placeholderData: keepPreviousDataForUser(userId),
  });
  return usePreviewable(query, (sample) =>
    isSampleMonth(sample, year, monthIndex0) ? sample.recurringMonth : undefined,
  );
}
