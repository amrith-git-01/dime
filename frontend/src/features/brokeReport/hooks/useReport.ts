import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { REPORT_SNAPSHOT_STALE_MS } from "@/lib/queryDefaults";

import { fetchReport, mapReportSnapshot } from "../api/reportsApi";
import { reportQueryKeys } from "../queryKeys";
import { SAMPLE_PERIOD_KEY, type ReportSnapshot } from "../types";
import { isReportPeriodKey } from "../utils/periodKey";
import { isReportSnapshot } from "../utils/snapshotShape";

/**
 * Runs on whatever is cached, persisted data included: the mapper fills the holes of a snapshot
 * written by another build, and something that is not a snapshot reads as missing.
 */
const selectSnapshot = (data: ReportSnapshot | null) => mapReportSnapshot(data);

/**
 * One stored snapshot. `data` is `null` when the server has none for the period (a normal "no
 * such report" state, not an error). A cached snapshot never goes stale; a `null`, or a cached
 * value that is not a snapshot (a bad persisted entry), is asked for again. The bundled sample
 * and a malformed period are not fetched.
 */
export function useReport(periodKey: string) {
  const { userId } = useSessionUserId();
  return useQuery({
    queryKey: reportQueryKeys.period(userId, periodKey),
    enabled:
      Boolean(userId) &&
      periodKey !== SAMPLE_PERIOD_KEY &&
      isReportPeriodKey(periodKey),
    staleTime: (query) =>
      isReportSnapshot(query.state.data) ? REPORT_SNAPSHOT_STALE_MS : 0,
    queryFn: () => fetchReport(periodKey),
    select: selectSnapshot,
  });
}
