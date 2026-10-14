import { useRef } from "react";
import { ScrollView } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { TourTarget } from "@/components/shared";
import { layout } from "@/constants";
import { tourTargetIds } from "@/constants/tourTargetIds";
import {
  InsightsBurnRateMetricCard,
  InsightsCounterpartyDonutCard,
  InsightsDailyCashflowChart,
  InsightsFixedCostsCard,
  InsightsHeavyChartsPlaceholder,
  InsightsIncomeSourcesCard,
  InsightsMonthCompareLauncherCard,
  InsightsMonthSummaryCard,
  InsightsTopExpensesCard,
} from "@/features/analytics/components";
import {
  InsightsScrollVisibilityProvider,
  useInsightsScrollVisibility,
} from "@/features/analytics/hooks/useInsightsScrollVisibility";
import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";
import { createThemedStyles } from "@/theme";

function AnalyticsInsightsScroll() {
  const styles = useStyles();
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const payeeTooltipDismissRef = useRef<(() => void) | null>(null);
  const { reportScroll } = useInsightsScrollVisibility();
  const {
    chartsReady,
    chartsDataSettled,
    monthOptions,
    selectedMonth,
    selectedMonthIndex,
    openInsightsMonthCompare,
    summary,
    summaryLoading,
    summaryFailed,
    hasMonthlyBudget,
    chartLoading,
    burnRateMetrics,
    paceLoading,
    burnRateToday,
    fixedCostsMonth,
    fixedCostsLoading,
    currentDay,
    dailyCashflow,
    chartYear,
    chartMonthIndex0,
    counterpartySpend,
    counterpartyIncome,
    topExpenses,
    openTransactionDetail,
    openTransactionsListForDay,
    openTransactionsListForPayee,
    onManualAdd,
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth,
    goNextMonth,
  } = useAnalyticsScreenModel();

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
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
      <TourTarget id={tourTargetIds.insightsSummary}>
        <InsightsMonthSummaryCard
          selectedMonth={selectedMonth.label}
          canGoPrevMonth={canGoPrevMonth}
          canGoNextMonth={canGoNextMonth}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          summary={summary}
          summaryLoading={summaryLoading}
          summaryFailed={summaryFailed}
          hasMonthlyBudget={hasMonthlyBudget}
        />
      </TourTarget>

      {chartsReady ? (
        <>
          <InsightsBurnRateMetricCard
            metrics={burnRateMetrics}
            loading={paceLoading}
            year={chartYear}
            monthIndex0={chartMonthIndex0}
            today={burnRateToday}
          />
          <InsightsFixedCostsCard
            data={fixedCostsMonth}
            loading={fixedCostsLoading}
            today={currentDay}
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
          <InsightsIncomeSourcesCard
            counterpartyIncome={counterpartyIncome}
            loading={chartLoading}
          />
          <InsightsTopExpensesCard
            topExpenses={topExpenses}
            loading={chartLoading}
            onTransactionPress={openTransactionDetail}
            onManualAdd={onManualAdd}
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

const useStyles = createThemedStyles(({ colors }) => ({
  scroll: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    ...layout.screenContent,
    gap: BENTO_SECTION_GAP,
  },
}));
