import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import { REPORT_LIST_STALE_MS } from "@/lib/queryDefaults";

import { fetchReportList, mapReportListItems } from "../api/reportsApi";
import { reportQueryKeys } from "../queryKeys";
import type { ReportListItem } from "../types";

/** Runs on whatever is cached, persisted rows included: a row that is not one is dropped. */
const selectList = (data: ReportListItem[]) => mapReportListItems(data);

/** Stored reports of the last 12 months, newest first. */
export function useReportsList() {
  const { userId } = useSessionUserId();
  return useQuery({
    queryKey: reportQueryKeys.list(userId),
    enabled: Boolean(userId),
    staleTime: REPORT_LIST_STALE_MS,
    queryFn: fetchReportList,
    select: selectList,
  });
}
