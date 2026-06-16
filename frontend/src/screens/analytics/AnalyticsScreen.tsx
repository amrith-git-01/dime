import { useRef, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, layout } from "@/constants";
import {
  InsightsBurnRateMetricCard,
  InsightsCounterpartyDonutCard,
  InsightsDailyCashflowChart,
  InsightsHeavyChartsPlaceholder,
  InsightsMonthCompareLauncherCard,
  InsightsMonthSummaryCard,
  InsightsTopExpensesCard,
} from "@/features/analytics/components";
import { useDeferredHeavyCharts } from "@/features/analytics/hooks/useDeferredHeavyCharts";
import {
  InsightsScrollVisibilityProvider,
  useInsightsScrollVisibility,
} from "@/features/analytics/hooks/useInsightsScrollVisibility";
import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";

function AnalyticsInsightsScroll() {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const payeeTooltipDismissRef = useRef<(() => void) | null>(null);
  const { reportScroll } = useInsightsScrollVisibility();
  const {
    hasInsightsData,
    chartsDataSettled,
    monthOptions,
    selectedMonth,
    selectedMonthIndex,
    handleSelectMonth,
    openInsightsMonthCompare,
    summary,
    summaryLoading,
    summaryFailed,
    chartLoading,
    burnRateMetrics,
    dailyCashflow,
    chartYear,
    chartMonthIndex0,
    counterpartySpend,
    topExpenses,
    openTransactionDetail,
    openTransactionsListForDay,
    openTransactionsListForPayee,
    onManualAdd,
    onReceipt,
    onVoice,
  } = useAnalyticsScreenModel();
  const { chartsReady } = useDeferredHeavyCharts(hasInsightsData);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={!monthMenuOpen}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={reportScroll}
      onScrollBeginDrag={() => {
        cashflowTooltipDismissRef.current?.();
        payeeTooltipDismissRef.current?.();
        reportScroll();
      }}
      onMomentumScrollEnd={reportScroll}
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

      {chartsReady ? (
        <>
          <InsightsBurnRateMetricCard
            metrics={burnRateMetrics}
            loading={chartLoading}
          />
          <InsightsDailyCashflowChart
            dailyCashflow={dailyCashflow}
            year={chartYear}
            monthIndex0={chartMonthIndex0}
            chartsDataSettled={chartsDataSettled}
            chartLoading={chartLoading}
            tooltipDismissRef={cashflowTooltipDismissRef}
            onViewDayPress={openTransactionsListForDay}
          />
          <InsightsCounterpartyDonutCard
            counterpartySpend={counterpartySpend}
            chartYear={chartYear}
            chartMonthIndex0={chartMonthIndex0}
            chartsDataSettled={chartsDataSettled}
            chartLoading={chartLoading}
            tooltipDismissRef={payeeTooltipDismissRef}
            onViewPayeePress={openTransactionsListForPayee}
          />
          <InsightsTopExpensesCard
            topExpenses={topExpenses}
            loading={chartLoading}
            onTransactionPress={openTransactionDetail}
            onManualAdd={onManualAdd}
            onReceipt={onReceipt}
            onVoice={onVoice}
          />
        </>
      ) : (
        <InsightsHeavyChartsPlaceholder />
      )}
      <InsightsMonthCompareLauncherCard
        monthOptions={monthOptions}
        insightsSelectedMonthIndex={selectedMonthIndex}
        onCompare={openInsightsMonthCompare}
      />
    </ScrollView>
  );
}

export default function AnalyticsScreen() {
  return (
    <TabScreenShell>
      <InsightsScrollVisibilityProvider>
        <AnalyticsInsightsScroll />
      </InsightsScrollVisibilityProvider>
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
