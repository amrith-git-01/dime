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
import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";

export default function AnalyticsScreen() {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const payeeTooltipDismissRef = useRef<(() => void) | null>(null);
  const {
    hasInsightsData,
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
  const { chartsReady, focusGeneration } =
    useDeferredHeavyCharts(hasInsightsData);

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!monthMenuOpen}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          cashflowTooltipDismissRef.current?.();
          payeeTooltipDismissRef.current?.();
        }}
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
              focusGeneration={focusGeneration}
              loading={chartLoading}
              tooltipDismissRef={cashflowTooltipDismissRef}
              onViewDayPress={openTransactionsListForDay}
            />
            <InsightsCounterpartyDonutCard
              counterpartySpend={counterpartySpend}
              chartYear={chartYear}
              chartMonthIndex0={chartMonthIndex0}
              focusGeneration={focusGeneration}
              loading={chartLoading}
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
