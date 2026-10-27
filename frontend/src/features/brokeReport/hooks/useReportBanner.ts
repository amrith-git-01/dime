import { useCallback, useState } from "react";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  dismissReportBanner,
  isReportBannerDismissed,
} from "@/lib/reports/reportBannerStorage";

import { pickBannerReport } from "../utils/bannerRule";
import { monthName } from "../utils/reportFormat";
import { useIstNow } from "./useIstNow";
import { useReportsList } from "./useReportsList";

/**
 * The Home banner: "Your {Month} Broke Report is ready". It shows only for the newest report while
 * it is unviewed, in the first seven days (IST) of the month after it, and until dismissed.
 * Dismissal is remembered per user and month on the device.
 */
export function useReportBanner() {
  const { userId } = useSessionUserId();
  const { data } = useReportsList();
  const now = useIstNow();
  // Dismissals made in this session; storage answers for earlier ones.
  const [dismissedNow, setDismissedNow] = useState<readonly string[]>([]);

  const report = pickBannerReport({
    reports: data,
    now,
    isDismissed: (periodKey) =>
      dismissedNow.includes(periodKey) ||
      (userId !== undefined && isReportBannerDismissed(userId, periodKey)),
  });

  const dismiss = useCallback(() => {
    if (!report) {
      return;
    }
    if (userId !== undefined) {
      dismissReportBanner(userId, report.period_key);
    }
    setDismissedNow((keys) => [...keys, report.period_key]);
  }, [report, userId]);

  return {
    periodKey: report?.period_key ?? null,
    monthLabel: report ? monthName(report.month) : null,
    dismiss,
  };
}
