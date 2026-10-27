import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef } from "react";

import { SAMPLE_SNAPSHOT } from "@/features/brokeReport/__fixtures__/reportFixtures";
import type { ReportStatus } from "@/features/brokeReport/components";
import { useMarkReportViewed } from "@/features/brokeReport/hooks/useMarkReportViewed";
import { useReport } from "@/features/brokeReport/hooks/useReport";
import { useReportsList } from "@/features/brokeReport/hooks/useReportsList";
import {
  SAMPLE_PERIOD_KEY,
  type ReportRoastLevel,
  type ReportSnapshot,
} from "@/features/brokeReport/types";
import { isReportPeriodKey } from "@/features/brokeReport/utils/periodKey";
import { useUserSettingsQuery } from "@/features/settings/hooks/useUserSettingsQuery";
import type { MainStackParamList } from "@/navigation/types";

type BrokeReportNavigation = NativeStackNavigationProp<
  MainStackParamList,
  "BrokeReport"
>;

export type BrokeReportScreenModel = {
  /** `ready` means `snapshot` is set. */
  status: ReportStatus | "ready";
  snapshot: ReportSnapshot | null;
  level: ReportRoastLevel;
  isSample: boolean;
  onRetry: () => void;
  onClose: () => void;
};

/**
 * The report route: the stored snapshot (or the bundled sample), the roast level from settings,
 * and the "viewed" mark, sent once when a real report opens. A 404 is the "not available" state,
 * not an error; a request waiting for the network is "offline".
 */
export function useBrokeReportScreenModel(): BrokeReportScreenModel {
  const navigation = useNavigation<BrokeReportNavigation>();
  const route = useRoute<RouteProp<MainStackParamList, "BrokeReport">>();
  const periodKey = route.params.periodKey;
  const isSample = periodKey === SAMPLE_PERIOD_KEY;

  const settings = useUserSettingsQuery();
  const level = settings.data?.reportRoastLevel ?? "spicy";

  const reportQuery = useReport(periodKey);
  const listQuery = useReportsList();
  const { mutate: markViewed } = useMarkReportViewed();

  const snapshot = isSample ? SAMPLE_SNAPSHOT : (reportQuery.data ?? null);

  // Sent once per opening of a period (the screen can be reused for another period), and not for
  // a report the list already says was seen.
  const listItem = listQuery.data?.find((item) => item.period_key === periodKey);
  const alreadyViewed = listItem?.viewed === true;
  const markedPeriodRef = useRef<string | null>(null);
  useEffect(() => {
    if (isSample || !snapshot || alreadyViewed || markedPeriodRef.current === periodKey) {
      return;
    }
    markedPeriodRef.current = periodKey;
    markViewed(periodKey);
  }, [isSample, snapshot, alreadyViewed, periodKey, markViewed]);

  let status: BrokeReportScreenModel["status"];
  if (snapshot) {
    status = "ready";
  } else if (!isSample && !isReportPeriodKey(periodKey)) {
    // A link with a malformed month: nothing to ask the server for.
    status = "missing";
  } else if (reportQuery.isError) {
    status = "error";
  } else if (reportQuery.data === null && reportQuery.fetchStatus === "idle") {
    // Settled on "no such report". A null while a request runs is a bad cached copy being replaced.
    status = "missing";
  } else if (reportQuery.fetchStatus === "paused") {
    status = "offline";
  } else {
    status = "loading";
  }

  const { refetch } = reportQuery;
  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onClose = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("MainTabs");
    }
  }, [navigation]);

  return { status, snapshot, level, isSample, onRetry, onClose };
}
