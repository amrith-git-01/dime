import { ScrollView, StyleSheet } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TwoToneEmptyState } from "@/components/shared";
import { colors, layout } from "@/constants";
import { CompareCashflowSection } from "@/features/analytics/components/compare/CompareCashflowSection";
import { ComparePaceSection } from "@/features/analytics/components/compare/ComparePaceSection";
import { ComparePayeeSection } from "@/features/analytics/components/compare/ComparePayeeSection";
import { CompareSummarySection } from "@/features/analytics/components/compare/CompareSummarySection";
import {
  InsightsScrollVisibilityProvider,
  useInsightsScrollVisibility,
} from "@/features/analytics/hooks/useInsightsScrollVisibility";

import { useInsightsMonthCompareScreenModel } from "./useInsightsMonthCompareScreenModel";

function InsightsMonthCompareContent() {
  const { monthA, monthB, spentDelta, bothFailed } =
    useInsightsMonthCompareScreenModel();
  const { reportScroll } = useInsightsScrollVisibility();

  if (bothFailed) {
    return (
      <TwoToneEmptyState
        layout="centered"
        title="Could not load comparison"
        message="Check your connection and try again from Insights."
      />
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={reportScroll}
      onScrollBeginDrag={reportScroll}
      onMomentumScrollEnd={reportScroll}
    >
      <CompareSummarySection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftSummary={monthA.summary}
        rightSummary={monthB.summary}
        leftLoading={monthA.summaryLoading}
        rightLoading={monthB.summaryLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
        spentDelta={spentDelta}
      />

      <ComparePaceSection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftMetrics={monthA.burnRateMetrics}
        rightMetrics={monthB.burnRateMetrics}
        leftLoading={monthA.chartLoading}
        rightLoading={monthB.chartLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
      />

      <CompareCashflowSection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftCashflow={monthA.dailyCashflow}
        rightCashflow={monthB.dailyCashflow}
        leftYear={monthA.year}
        leftMonthIndex0={monthA.monthIndex0}
        rightYear={monthB.year}
        rightMonthIndex0={monthB.monthIndex0}
        leftLoading={monthA.chartLoading}
        rightLoading={monthB.chartLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
      />

      <ComparePayeeSection
        leftLabel={monthA.label}
        rightLabel={monthB.label}
        leftSpend={monthA.counterpartySpend}
        rightSpend={monthB.counterpartySpend}
        leftYear={monthA.year}
        leftMonthIndex0={monthA.monthIndex0}
        rightYear={monthB.year}
        rightMonthIndex0={monthB.monthIndex0}
        leftLoading={monthA.chartLoading}
        rightLoading={monthB.chartLoading}
        leftFailed={monthA.isError}
        rightFailed={monthB.isError}
      />
    </ScrollView>
  );
}

export default function InsightsMonthCompareScreen() {
  return (
    <InsightsScrollVisibilityProvider>
      <InsightsMonthCompareContent />
    </InsightsScrollVisibilityProvider>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  scrollContent: {
    ...layout.screenContent,
    gap: BENTO_SECTION_GAP,
    paddingBottom: BENTO_SECTION_GAP,
  },
});
