import {
  ChartTooltipOverlay,
  netTone,
  type ChartTooltipAnchor,
} from "@/components/shared";
import { accent, colors, inkSoft, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { DailyCashflowRow } from "@/features/analytics/types";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrChartAxis, formatInrCompact } from "@/utils/currency";
import { useIsFocused } from "@react-navigation/native";
import { format, parseISO } from "date-fns";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { INSIGHTS_CHART_BAR_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import { useChartInViewport } from "@/features/analytics/hooks/useChartInViewport";
import { useVictoryChartEntry } from "@/features/analytics/hooks/useVictoryChartEntry";
import { zeroCashflowChartRows } from "@/features/analytics/utils/chartEntryData";
import {
  buildFullMonthCashflowDays,
  buildMonthlyCashflowChartModel,
  CASHFLOW_DAY_SLOT_WIDTH,
  cashflowChartScrollWidth,
  cashflowScrollOffsetForToday,
  CHART_LEADING_ANCHOR_DAY,
  chartTrailingAnchorDay,
  formatCashflowXLabel,
} from "../utils/buildCashflowWindow";
import { CashflowVictoryChart } from "./CashflowVictoryChart";
import { InsightsCashflowChartSkeleton } from "./InsightsAnalyticsSkeletons";
import { InsightsCard } from "./InsightsCard";

const CHART_PLOT_HEIGHT = 212;
const X_LABEL_ROW_HEIGHT = 22;
const Y_AXIS_GUTTER = 46;

export type InsightsCashflowDaySelection = {
  day: number;
  date: string;
  expense: number;
  income: number;
  net: number;
};

type CashflowDayPress = InsightsCashflowDaySelection;

type SelectedDay = {
  selection: CashflowDayPress;
  anchorWindow: ChartTooltipAnchor;
};

function cashflowTooltipTitle(
  day: CashflowDayPress,
  todayDay: number | null,
): string {
  if (todayDay != null && day.day === todayDay) {
    return "Today";
  }
  return format(parseISO(day.date), "d MMM");
}

function toDayPress(row: {
  day: number;
  date: string;
  expense: number;
  income: number;
  net: number;
}): CashflowDayPress {
  return {
    day: row.day,
    date: row.date,
    expense: row.expense,
    income: row.income,
    net: row.net,
  };
}

type CashflowDayHitCellProps = {
  width: number;
  selected: boolean;
  onPress: (anchor: ChartTooltipAnchor) => void;
  accessibilityLabel: string;
};

const CashflowDayHitCell = memo(function CashflowDayHitCell({
  width,
  selected,
  onPress,
  accessibilityLabel,
}: CashflowDayHitCellProps) {
  const cellRef = useRef<View>(null);

  return (
    <Pressable
      ref={cellRef}
      style={[
        styles.dayHitCell,
        { width },
        selected && styles.dayHitCellSelected,
      ]}
      onPress={() => {
        void triggerHaptic();
        cellRef.current?.measureInWindow((x, y, w, h) => {
          onPress({ x, y, width: w, height: h });
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
    />
  );
});

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

    const [selected, setSelected] = useState<SelectedDay | null>(null);
    const scrollRef = useRef<ScrollView>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const isFocused = useIsFocused();

    const dismissTooltip = useCallback(() => {
      setSelected(null);
    }, []);

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

    useEffect(() => {
      if (!tooltipDismissRef) {
        return;
      }
      tooltipDismissRef.current = dismissTooltip;
      return () => {
        tooltipDismissRef.current = null;
      };
    }, [dismissTooltip, tooltipDismissRef]);

    const handleDayPress = useCallback(
      (row: (typeof monthDays)[number], anchorWindow: ChartTooltipAnchor) => {
        const next = toDayPress(row);
        setSelected((prev) =>
          prev?.selection.day === next.day
            ? null
            : { selection: next, anchorWindow },
        );
      },
      [],
    );

    const tooltipRows = useMemo(() => {
      if (!selected) {
        return null;
      }
      const { expense, income, net } = selected.selection;
      return [
        {
          label: "Expense",
          value: formatInrCompact(expense),
          tone: "debit" as const,
        },
        {
          label: "Income",
          value: formatInrCompact(income),
          tone: "credit" as const,
        },
        {
          label: "Net",
          value: formatInrCompact(net),
          tone: netTone(net),
        },
      ];
    }, [selected]);

    const tooltipTitle =
      selected != null
        ? cashflowTooltipTitle(selected.selection, todayDay)
        : "";

    const handleTooltipViewPress = useCallback(() => {
      const day = selected?.selection;
      if (!day) {
        return;
      }
      dismissTooltip();
      onViewDayPress?.(day);
    }, [dismissTooltip, onViewDayPress, selected]);

    const tooltipViewAction = useMemo(
      () => ({ label: "View day", onPress: handleTooltipViewPress }),
      [handleTooltipViewPress],
    );

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
                    <View
                      style={[
                        styles.yAxisColumn,
                        { height: CHART_PLOT_HEIGHT },
                        yTickValues.length === 1 &&
                          styles.yAxisColumnOriginOnly,
                      ]}
                    >
                      {[...yTickValues].reverse().map((tick) => (
                        <Text key={`y-${tick}`} style={styles.yAxisLabel}>
                          {formatInrChartAxis(tick)}
                        </Text>
                      ))}
                    </View>

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

                          <View
                            style={styles.dayHitRow}
                            pointerEvents="box-none"
                          >
                            <Pressable
                              style={[
                                styles.dayHitCell,
                                { width: CASHFLOW_DAY_SLOT_WIDTH },
                              ]}
                              onPress={dismissTooltip}
                              accessibilityRole="button"
                              accessibilityLabel="Dismiss chart details"
                            />
                            {monthDays.map((d) => {
                              const isSelected =
                                selected?.selection.day === d.day;
                              return (
                                <CashflowDayHitCell
                                  key={d.date}
                                  width={CASHFLOW_DAY_SLOT_WIDTH}
                                  selected={isSelected}
                                  onPress={(anchor) =>
                                    handleDayPress(d, anchor)
                                  }
                                  accessibilityLabel={`Day ${d.day} cash flow`}
                                />
                              );
                            })}
                            <Pressable
                              style={[
                                styles.dayHitCell,
                                { width: CASHFLOW_DAY_SLOT_WIDTH },
                              ]}
                              onPress={dismissTooltip}
                              accessibilityRole="button"
                              accessibilityLabel="Dismiss chart details"
                            />
                          </View>
                        </View>

                        <View
                          style={[
                            styles.xLabelsRow,
                            { height: X_LABEL_ROW_HEIGHT },
                          ]}
                        >
                          <View
                            style={[
                              styles.xLabelCell,
                              { width: CASHFLOW_DAY_SLOT_WIDTH },
                            ]}
                          />
                          {monthDays.map((d) => {
                            const isToday =
                              todayDay != null && d.day === todayDay;
                            return (
                              <View
                                key={d.date}
                                style={[
                                  styles.xLabelCell,
                                  { width: CASHFLOW_DAY_SLOT_WIDTH },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.xLabelText,
                                    isToday && styles.xLabelToday,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {formatCashflowXLabel(d.day, todayDay)}
                                </Text>
                              </View>
                            );
                          })}
                          <View
                            style={[
                              styles.xLabelCell,
                              { width: CASHFLOW_DAY_SLOT_WIDTH },
                            ]}
                          />
                        </View>
                      </View>
                    </ScrollView>
                  </View>

                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={styles.legendBar} />
                      <Text style={styles.legendLabel}>Expense</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={styles.legendDot} />
                      <Text style={styles.legendLabel}>Income</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          </InsightsCard>
        </View>
        <ChartTooltipOverlay
          visible={selected != null && tooltipRows != null}
          onDismiss={dismissTooltip}
          title={tooltipTitle}
          rows={tooltipRows ?? []}
          anchor={selected?.anchorWindow ?? null}
          viewAction={tooltipViewAction}
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
  yAxisColumn: {
    width: Y_AXIS_GUTTER,
    justifyContent: "space-between",
    paddingTop: 10,
    paddingBottom: 4,
    paddingRight: 4,
  },
  yAxisColumnOriginOnly: {
    justifyContent: "flex-end",
    paddingTop: 0,
  },
  yAxisLabel: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 8,
    lineHeight: 10,
    color: inkSoft,
    textAlign: "right",
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
  dayHitRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 2,
  },
  dayHitCell: {
    height: "100%",
  },
  dayHitCellSelected: {
    backgroundColor: `${accent}14`,
  },
  xLabelsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 2,
  },
  xLabelCell: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  xLabelText: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 9,
    lineHeight: 12,
    color: inkSoft,
    textAlign: "center",
  },
  xLabelToday: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 8,
    lineHeight: 11,
    color: accent,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendBar: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: accent,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  legendLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    color: inkSoft,
  },
});
