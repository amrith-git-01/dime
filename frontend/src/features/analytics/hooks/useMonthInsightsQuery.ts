import { useQuery } from "@tanstack/react-query";

import { fetchMonthInsights } from "@/features/analytics/api/fetchMonthInsights";
import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { keepPreviousDataForUser } from "@/lib/keepPreviousDataForUser";
import { TRANSACTIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

export function useMonthInsightsQuery(
  year: number,
  monthIndex0: number,
  options?: { enabled?: boolean },
) {
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;

  return useQuery({
    queryKey: insightsQueryKeys.month(userId, year, calendarMonth, timezone),
    queryFn: () => fetchMonthInsights({ year, month: calendarMonth, timezone }),
    enabled: (options?.enabled ?? true) && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
    placeholderData: keepPreviousDataForUser(userId),
  });
}
