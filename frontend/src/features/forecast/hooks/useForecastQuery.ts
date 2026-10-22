import { useQuery } from "@tanstack/react-query";

import { isCurrentMonth } from "@/features/analytics/utils/buildCashflowWindow";
import {
  isForecastEmpty,
  pickSampleMonth,
  usePreviewable,
} from "@/features/tourPreview";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useSessionUserId } from "@/hooks/useSessionUserId";
import { TRANSACTIONS_QUERY_STALE_MS } from "@/lib/queryDefaults";
import { getDeviceIanaTimezone } from "@/utils/deviceTimezone";

import { fetchForecast } from "../api/forecastApi";
import { forecastQueryKeys } from "../queryKeys";

/**
 * The month-end forecast, Coming up and Watch. Only the current month has a future to predict,
 * so the query stays off for any other month (there is no placeholder either: another month's
 * forecast must never stand in for this one).
 */
export function useForecastQuery(year: number, monthIndex0: number) {
  const { userId } = useSessionUserId();
  const timezone = getDeviceIanaTimezone();
  const calendarMonth = monthIndex0 + 1;
  // Read off the day tick (it moves at midnight), not the clock at render time.
  const isCurrent = isCurrentMonth(year, monthIndex0, useCurrentDay());

  const query = useQuery({
    queryKey: forecastQueryKeys.month(userId, year, calendarMonth, timezone),
    queryFn: () => fetchForecast({ year, month: calendarMonth, timezone }),
    enabled: isCurrent && Boolean(userId),
    staleTime: TRANSACTIONS_QUERY_STALE_MS,
  });
  return usePreviewable(query, {
    domain: "transactions",
    isEmpty: isForecastEmpty,
    select: (set) => {
      const picked = pickSampleMonth(set, year, monthIndex0);
      return picked && !picked.past
        ? { data: picked.month.forecast }
        : undefined;
    },
  });
}
