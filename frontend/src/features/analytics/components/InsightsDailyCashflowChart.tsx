import { spacing } from "@/constants";
import type { DailyCashflowRow } from "@/features/analytics/types";
import { useIsFocused } from "@react-navigation/native";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { INSIGHTS_CHART_BAR_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import { useChartInViewport } from "@/features/analytics/hooks/useChartInViewport";
import { useVictoryChartEntry } from "@/features/analytics/hooks/useVictoryChartEntry";
import { zeroCashflowChartRows } from "@/features/analytics/utils/chartEntryData";
import {
  useCashflowDayTooltip,
  type InsightsCashflowDaySelection,
} from "../hooks/useCashflowDayTooltip";
import {
  buildFullMonthCashflowDays,
  buildMonthlyCashflowChartModel,
  cashflowChartScrollWidth,
  cashflowScrollOffsetForToday,
  CHART_LEADING_ANCHOR_DAY,
  chartTrailingAnchorDay,
} from "../utils/buildCashflowWindow";
import {
  CashflowLegend,
  CashflowXLabels,
  CashflowYAxis,
} from "./CashflowChartChrome";
import { CashflowDayHitRow } from "./CashflowDayHitRow";
import { CashflowDayTooltip } from "./CashflowDayTooltip";
import { CashflowVictoryChart } from "./CashflowVictoryChart";
import { InsightsCashflowChartSkeleton } from "./InsightsAnalyticsSkeletons";
import { InsightsCard } from "./InsightsCard";

const CHART_PLOT_HEIGHT = 212;

export type { InsightsCashflowDaySelection };

export type InsightsDailyCashflowChartProps = {
  dailyCashflow: DailyCashflowRow[];
  year: number;
  monthIndex0: number;
  chartsDataSettled: boolean;
  chartLoading?: boolean;
  /** Parent scroll views can call this ref to dismiss an open day tooltip. */
  tooltipDismissRef?: MutableRefObject<(() => void) | null>;
  /** Fired when the user taps View in the day tooltip (navigation wired later). */
  onViewDayPress?: (day: InsightsCashflowDaySelection) => void;
};

export const InsightsDailyCashflowChart = memo(
  function InsightsDailyCashflowChart({
    dailyCashflow,
    year,
    monthIndex0,
    chartsDataSettled,
    chartLoading = false,
    tooltipDismissRef,
    onViewDayPress,
  }: InsightsDailyCashflowChartProps) {
    const { containerRef, onChartLayout, isFullyVisible } =
      useChartInViewport();

    const { monthDays, lastDay, todayDay } = useMemo(
      () => buildFullMonthCashflowDays(dailyCashflow, year, monthIndex0),
      [dailyCashflow, monthIndex0, year],
    );

    const scrollWidth = useMemo(
      () => cashflowChartScrollWidth(monthDays.length),
      [monthDays.length],
    );

    const trailingAnchorDay = chartTrailingAnchorDay(lastDay);

    const { chartData, yMax, barPadding, yTickValues } = useMemo(
      () => buildMonthlyCashflowChartModel(monthDays, trailingAnchorDay),
      [monthDays, trailingAnchorDay],
    );

    const domain = useMemo(
      () => ({
        x: [CHART_LEADING_ANCHOR_DAY, trailingAnchorDay] as [number, number],
        y: [0, yMax] as [number, number],
      }),
      [trailingAnchorDay, yMax],
    );

    const zeroChartData = useMemo(
      () => zeroCashflowChartRows(chartData),
      [chartData],
    );

    const { data: entryChartData, animate: chartAnimate } =
      useVictoryChartEntry({
        identity: `cashflow-${year}-${monthIndex0}`,
        zeroData: zeroChartData,
        targetData: chartData,
        enabled: chartsDataSettled && !chartLoading,
        isFullyVisible,
        animateConfig: INSIGHTS_CHART_BAR_ANIMATION,
      });

    const victoryChartData = chartLoading ? zeroChartData : entryChartData;
    const victoryAnimate = chartLoading ? undefined : chartAnimate;

    // Income dot flags — derived from victoryChartData so dots only appear
    // once bars animate in (zero phase has income=0, target phase shows real data).
    const incomeFlags = useMemo(
      () => victoryChartData.map((row) => row.income > 0),
      [victoryChartData],
    );

    const {
      selected,
      selectedDay,
      dismissTooltip,
      handleDayPress,
      handleViewPress,
    } = useCashflowDayTooltip({ tooltipDismissRef, onViewDayPress });

    const scrollRef = useRef<ScrollView>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const isFocused = useIsFocused();

    useEffect(() => {
      if (
        !isFocused ||
        chartLoading ||
        todayDay == null ||
        viewportWidth <= 0
      ) {
        return;
      }
      scrollRef.current?.scrollTo({
        x: cashflowScrollOffsetForToday(todayDay, viewportWidth, scrollWidth),
        animated: false,
      });
    }, [
      chartLoading,
      entryChartData,
      isFocused,
      scrollWidth,
      todayDay,
      viewportWidth,
      year,
      monthIndex0,
    ]);

    return (
      <>
        <View ref={containerRef} collapsable={false} onLayout={onChartLayout}>
          <InsightsCard
            kicker="DAILY CASH FLOW"
            subtitle="Expense each day this month"
          >
            <View style={styles.body}>
              {chartLoading ? (
                <InsightsCashflowChartSkeleton />
              ) : (
                <>
                  <View style={styles.chartRow}>
                    <CashflowYAxis
                      tickValues={yTickValues}
                      plotHeight={CHART_PLOT_HEIGHT}
                    />

                    <ScrollView
                      ref={scrollRef}
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator
                      style={styles.chartScroll}
                      contentContainerStyle={styles.chartScrollContent}
                      onLayout={(e) =>
                        setViewportWidth(e.nativeEvent.layout.width)
                      }
                      onScrollBeginDrag={dismissTooltip}
                      onMomentumScrollBegin={dismissTooltip}
                    >
                      <View style={{ width: scrollWidth }}>
                        <View style={styles.chartPlot}>
                          <CashflowVictoryChart
                            animate={victoryAnimate}
                            chartData={victoryChartData}
                            domain={domain}
                            barPadding={barPadding}
                            plotHeight={CHART_PLOT_HEIGHT}
                            plotWidth={scrollWidth}
                            incomeFlags={incomeFlags}
                            todayDay={todayDay}
                          />

                          <CashflowDayHitRow
                            monthDays={monthDays}
                            selectedDay={selectedDay}
                            onDismiss={dismissTooltip}
                            onDayPress={handleDayPress}
                          />
                        </View>

                        <CashflowXLabels
                          monthDays={monthDays}
                          todayDay={todayDay}
                        />
                      </View>
                    </ScrollView>
                  </View>

                  <CashflowLegend />
                </>
              )}
            </View>
          </InsightsCard>
        </View>
        <CashflowDayTooltip
          selected={selected}
          todayDay={todayDay}
          onDismiss={dismissTooltip}
          onViewPress={handleViewPress}
        />
      </>
    );
  },
);

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  chartScroll: {
    flex: 1,
  },
  chartScrollContent: {
    flexGrow: 1,
  },
  chartPlot: {
    position: "relative",
  },
});
