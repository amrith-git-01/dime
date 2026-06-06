import { useRef, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { colors, layout } from "@/constants";
import {
  InsightsBurnRateMetricCard,
  InsightsCounterpartyDonutCard,
  InsightsDailyCashflowChart,
  InsightsMonthCompareLauncherCard,
  InsightsMonthSummaryCard,
  InsightsTopExpensesCard,
} from "@/features/analytics/components";
import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";

export default function AnalyticsScreen() {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const payeeTooltipDismissRef = useRef<(() => void) | null>(null);
  const {
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
          onViewDayPress={openTransactionsListForDay}
        />
        <InsightsCounterpartyDonutCard
          counterpartySpend={counterpartySpend}
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
