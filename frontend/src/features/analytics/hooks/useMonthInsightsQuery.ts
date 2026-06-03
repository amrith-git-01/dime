import { useQuery } from "@tanstack/react-query";

import { fetchMonthInsights } from "@/features/analytics/api/fetchMonthInsights";
import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

const STALE_MS = 5 * 60 * 1000;

export function useMonthInsightsQuery(year: number, monthIndex0: number) {
  const { userId, authReady } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;

  return useQuery({
    queryKey: insightsQueryKeys.month(
      userId,
      year,
      calendarMonth,
      timezone,
    ),
    queryFn: () =>
      fetchMonthInsights({
        year,
        month: calendarMonth,
        timezone,
      }),
    enabled: authReady && Boolean(userId),
    staleTime: STALE_MS,
  });
}
