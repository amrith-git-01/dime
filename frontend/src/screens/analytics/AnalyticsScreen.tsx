import { useRef, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, layout } from "@/constants";
import {
  InsightsBurnRateMetricCard,
  InsightsDailyCashflowChart,
  InsightsMonthSummaryCard,
} from "@/features/analytics/components";

import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";

export default function AnalyticsScreen() {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const {
    monthOptions,
    selectedMonth,
    handleSelectMonth,
    summary,
    summaryLoading,
    summaryFailed,
    chartLoading,
    showInsightsBlocks,
    burnRateMetrics,
    dailyCashflow,
    chartYear,
    chartMonthIndex0,
  } = useAnalyticsScreenModel();

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!monthMenuOpen}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => cashflowTooltipDismissRef.current?.()}
      >
        <InsightsMonthSummaryCard
          selectedMonth={selectedMonth.label}
          monthOptions={monthOptions}
          onSelectMonth={handleSelectMonth}
          onMonthMenuOpenChange={setMonthMenuOpen}
          summary={summary}
          summaryLoading={summaryLoading}
          summaryFailed={summaryFailed}
        />

        {showInsightsBlocks ? (
          <>
            <InsightsBurnRateMetricCard
              metrics={burnRateMetrics}
              loading={chartLoading}
            />
            <InsightsDailyCashflowChart
              dailyCashflow={dailyCashflow}
              year={chartYear}
              monthIndex0={chartMonthIndex0}
              loading={chartLoading}
              tooltipDismissRef={cashflowTooltipDismissRef}
            />
          </>
        ) : null}
      </ScrollView>
    </TabScreenShell>
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
  },
});
