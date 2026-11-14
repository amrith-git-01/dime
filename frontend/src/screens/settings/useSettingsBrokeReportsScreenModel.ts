import { useCallback } from "react";

import { useOpenReport } from "@/features/brokeReport/hooks/useOpenReport";
import { useReportsList } from "@/features/brokeReport/hooks/useReportsList";
import { SAMPLE_PERIOD_KEY } from "@/features/brokeReport/types";
import { REPORT_SETTINGS_KEYS } from "@/features/settings/constants/settingsSlices";
import { useSettingsDraft } from "@/features/settings/hooks/useSettingsDraft";
import type { ReportRoastLevel } from "@/features/settings/types";
import { useToast } from "@/features/toast/useToast";
import { parseFastApiError } from "@/lib/api/parseFastApiError";

/**
 * Settings -> Broke Reports: the report settings (monthly push, roast level) with their own Save,
 * and every stored report, newest first (the endpoint's order).
 */
export function useSettingsBrokeReportsScreenModel() {
  const query = useReportsList();
  const openReport = useOpenReport();
  const { showToast } = useToast();
  const settings = useSettingsDraft(REPORT_SETTINGS_KEYS);
  const { draft, patchDraft, save } = settings;
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

  const handleSave = useCallback(async () => {
    try {
      if (await save()) {
        showToast({ variant: "success", message: "Report settings saved" });
      }
    } catch (error: unknown) {
      showToast({
        variant: "error",
        message: parseFastApiError(error) || "Could not save report settings.",
      });
    }
  }, [save, showToast]);

  const busy = settings.saving;

  return {
    listProps: {
      items,
      isLoading: query.isPending && !waitingOffline,
      isError: query.isError || waitingOffline,
      onRetry,
      onOpen: openReport,
      onOpenSample,
    },
    settingsProps: {
      reportAlertsEnabled: draft.reportAlertsEnabled,
      reportRoastLevel: draft.reportRoastLevel,
      // Until the settings load there is nothing to compare against: show the defaults, locked.
      togglesDisabled: busy || !settings.isReady,
      onReportAlertsChange: (enabled: boolean) =>
        patchDraft({ reportAlertsEnabled: enabled }),
      onReportRoastLevelChange: (level: ReportRoastLevel) =>
        patchDraft({ reportRoastLevel: level }),
      onClear: settings.clear,
      onSave: () => void handleSave(),
      saveLoading: busy,
      saveDisabled: !settings.isDirty || busy,
      clearDisabled: !settings.isDirty || busy,
    },
  };
}
