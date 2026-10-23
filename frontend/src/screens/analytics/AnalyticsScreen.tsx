import { useRef } from "react";
import { ScrollView } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { TourTarget } from "@/components/shared";
import { FLOATING_BUTTONS_CLEARANCE, layout } from "@/constants";
import { tourTargetIds } from "@/constants/tourTargetIds";
import {
  InsightsCounterpartyDonutCard,
  InsightsDailyCashflowChart,
  InsightsEmptyChartCard,
  InsightsFixedCostsCard,
  InsightsHeavyChartsPlaceholder,
  InsightsMonthCompareLauncherCard,
  InsightsMonthSummaryCard,
  InsightsMonthSwitcher,
  InsightsTopExpensesCard,
} from "@/features/analytics/components";
import {
  InsightsScrollVisibilityProvider,
  useInsightsScrollVisibility,
} from "@/features/analytics/hooks/useInsightsScrollVisibility";
import { useTourScroller } from "@/hooks/useTourScroller";

import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";
import { createThemedStyles } from "@/theme";

function AnalyticsInsightsScroll() {
  const styles = useStyles();
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const payeeTooltipDismissRef = useRef<(() => void) | null>(null);
  const payerTooltipDismissRef = useRef<(() => void) | null>(null);
  const { reportScroll } = useInsightsScrollVisibility();
  const scrollRef = useRef<ScrollView>(null);
  // Lets the guided tour scroll Insights so each spotlighted card is in view.
  const { onScroll: onTourScroll } = useTourScroller("insights", (y, animated) =>
    scrollRef.current?.scrollTo({ y, animated }),
  );
  const {
    monthEmpty,
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
    openTransactionsListForPayer,
    onManualAdd,
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth,
    goNextMonth,
  } = useAnalyticsScreenModel();

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={16}
      onScroll={(event) => {
        onTourScroll(event);
        reportScroll();
      }}
      onScrollBeginDrag={() => {
        cashflowTooltipDismissRef.current?.();
        payeeTooltipDismissRef.current?.();
        payerTooltipDismissRef.current?.();
        reportScroll();
      }}
      onMomentumScrollEnd={reportScroll}
    >
      <InsightsMonthSwitcher
        selectedMonth={selectedMonth.label}
        prevMonthLabel={monthOptions[selectedMonthIndex + 1]?.label}
        nextMonthLabel={monthOptions[selectedMonthIndex - 1]?.label}
        canGoPrevMonth={canGoPrevMonth}
        canGoNextMonth={canGoNextMonth}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
      />

      <TourTarget id={tourTargetIds.insightsSummary}>
        <InsightsMonthSummaryCard
          summary={summary}
          summaryLoading={summaryLoading}
          summaryFailed={summaryFailed}
          hasMonthlyBudget={hasMonthlyBudget}
        />
      </TourTarget>

      {monthEmpty ? (
        <InsightsEmptyChartCard onAddExpense={onManualAdd} />
      ) : chartsReady ? (
        <>
          <InsightsFixedCostsCard
            data={fixedCostsMonth}
            loading={fixedCostsLoading}
            today={currentDay}
          />
          <TourTarget id={tourTargetIds.insightsCashflow}>
            <InsightsDailyCashflowChart
              dailyCashflow={dailyCashflow}
              year={chartYear}
              monthIndex0={chartMonthIndex0}
              chartsDataSettled={chartsDataSettled}
              chartLoading={chartLoading}
              tooltipDismissRef={cashflowTooltipDismissRef}
              onViewDayPress={openTransactionsListForDay}
            />
          </TourTarget>
          <TourTarget id={tourTargetIds.insightsPayees}>
            <InsightsCounterpartyDonutCard
              rows={counterpartySpend}
              chartYear={chartYear}
              chartMonthIndex0={chartMonthIndex0}
              chartsDataSettled={chartsDataSettled}
              chartLoading={chartLoading}
              tooltipDismissRef={payeeTooltipDismissRef}
              onViewPayeePress={openTransactionsListForPayee}
            />
          </TourTarget>
          <InsightsCounterpartyDonutCard
            variant="income"
            rows={counterpartyIncome}
            chartYear={chartYear}
            chartMonthIndex0={chartMonthIndex0}
            chartsDataSettled={chartsDataSettled}
            chartLoading={chartLoading}
            tooltipDismissRef={payerTooltipDismissRef}
            onViewPayeePress={openTransactionsListForPayer}
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
      <TourTarget id={tourTargetIds.insightsCompare}>
        <InsightsMonthCompareLauncherCard
          monthOptions={monthOptions}
          insightsSelectedMonthIndex={selectedMonthIndex}
          onCompare={openInsightsMonthCompare}
        />
      </TourTarget>
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
    paddingBottom: FLOATING_BUTTONS_CLEARANCE,
    gap: BENTO_SECTION_GAP,
  },
}));
