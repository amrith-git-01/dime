import { useRef, type ReactNode } from "react";
import { ScrollView } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { TourTarget } from "@/components/shared";
import { ARRANGE_SCREEN_BOTTOM_CLEARANCE, layout } from "@/constants";
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
  ArrangeCards,
  OrderedCards,
  useCardOrder,
  type InsightsCardId,
} from "@/features/cardLayout";
import {
  InsightsScrollVisibilityProvider,
  useInsightsScrollVisibility,
} from "@/features/analytics/hooks/useInsightsScrollVisibility";
import { useTourScroller } from "@/hooks/useTourScroller";

import { useAnalyticsScreenModel } from "./useAnalyticsScreenModel";
import { createThemedStyles } from "@/theme";

/** The cards that share the screen-wide "no data yet" gating below. */
const CHART_CARD_IDS: readonly InsightsCardId[] = [
  "insights.fixedCosts",
  "insights.cashflow",
  "insights.payees",
  "insights.income",
  "insights.topExpenses",
];

function AnalyticsInsightsScroll() {
  const styles = useStyles();
  const cashflowTooltipDismissRef = useRef<(() => void) | null>(null);
  const payeeTooltipDismissRef = useRef<(() => void) | null>(null);
  const payerTooltipDismissRef = useRef<(() => void) | null>(null);
  const { reportScroll } = useInsightsScrollVisibility();
  const cardOrder = useCardOrder("insights");
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

  // No data yet or still loading: one stand-in card takes the place of the first chart card in the
  // user's order and the other chart cards render nothing, wherever they were moved to.
  const firstChartCard = cardOrder.order.find((id) =>
    CHART_CARD_IDS.includes(id),
  );
  const chartsStandIn: ReactNode = monthEmpty ? (
    <InsightsEmptyChartCard onAddExpense={onManualAdd} />
  ) : (
    <InsightsHeavyChartsPlaceholder />
  );
  const showCharts = !monthEmpty && chartsReady;
  const chartCard = (id: InsightsCardId, card: ReactNode): ReactNode => {
    if (showCharts) {
      return card;
    }
    return id === firstChartCard ? chartsStandIn : null;
  };

  const cards: Partial<Record<InsightsCardId, ReactNode>> = {
    "insights.month": (
      <InsightsMonthSwitcher
        selectedMonth={selectedMonth.label}
        prevMonthLabel={monthOptions[selectedMonthIndex + 1]?.label}
        nextMonthLabel={monthOptions[selectedMonthIndex - 1]?.label}
        canGoPrevMonth={canGoPrevMonth}
        canGoNextMonth={canGoNextMonth}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
      />
    ),
    "insights.summary": (
      <TourTarget id={tourTargetIds.insightsSummary}>
        <InsightsMonthSummaryCard
          summary={summary}
          summaryLoading={summaryLoading}
          summaryFailed={summaryFailed}
          hasMonthlyBudget={hasMonthlyBudget}
        />
      </TourTarget>
    ),
    "insights.fixedCosts": chartCard(
      "insights.fixedCosts",
      <InsightsFixedCostsCard
        data={fixedCostsMonth}
        loading={fixedCostsLoading}
        today={currentDay}
      />,
    ),
    "insights.cashflow": chartCard(
      "insights.cashflow",
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
      </TourTarget>,
    ),
    "insights.payees": chartCard(
      "insights.payees",
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
      </TourTarget>,
    ),
    "insights.income": chartCard(
      "insights.income",
      <InsightsCounterpartyDonutCard
        variant="income"
        rows={counterpartyIncome}
        chartYear={chartYear}
        chartMonthIndex0={chartMonthIndex0}
        chartsDataSettled={chartsDataSettled}
        chartLoading={chartLoading}
        tooltipDismissRef={payerTooltipDismissRef}
        onViewPayeePress={openTransactionsListForPayer}
      />,
    ),
    "insights.topExpenses": chartCard(
      "insights.topExpenses",
      <InsightsTopExpensesCard
        topExpenses={topExpenses}
        loading={chartLoading}
        onTransactionPress={openTransactionDetail}
        onManualAdd={onManualAdd}
      />,
    ),
    "insights.compare": (
      <TourTarget id={tourTargetIds.insightsCompare}>
        <InsightsMonthCompareLauncherCard
          monthOptions={monthOptions}
          insightsSelectedMonthIndex={selectedMonthIndex}
          onCompare={openInsightsMonthCompare}
        />
      </TourTarget>
    ),
  };

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
      <OrderedCards
        order={cardOrder.order}
        cards={cards}
        ready={cardOrder.ready}
      />

      <ArrangeCards screen="insights" cardOrder={cardOrder} />
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
    paddingBottom: ARRANGE_SCREEN_BOTTOM_CLEARANCE,
    gap: BENTO_SECTION_GAP,
  },
}));
