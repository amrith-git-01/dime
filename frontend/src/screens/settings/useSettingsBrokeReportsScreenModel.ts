import { useCallback } from "react";

import { useOpenReport } from "@/features/brokeReport/hooks/useOpenReport";
import { useReportsList } from "@/features/brokeReport/hooks/useReportsList";
import { SAMPLE_PERIOD_KEY } from "@/features/brokeReport/types";

/** Settings -> Broke Reports: every stored report, newest first (the endpoint's order). */
export function useSettingsBrokeReportsScreenModel() {
  const query = useReportsList();
  const openReport = useOpenReport();
  const { refetch } = query;

  const items = query.data ?? [];
  // Waiting for a network that is not there reads as a failure, not as an endless skeleton.
  const waitingOffline = query.isPending && query.fetchStatus === "paused";

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const onOpenSample = useCallback(
    () => openReport(SAMPLE_PERIOD_KEY),
    [openReport],
  );

  return {
    items,
    isLoading: query.isPending && !waitingOffline,
    isError: query.isError || waitingOffline,
    onRetry,
    onOpen: openReport,
    onOpenSample,
  };
}
