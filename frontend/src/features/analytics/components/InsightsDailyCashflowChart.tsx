import { Group, rect } from "@shopify/react-native-skia";
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
import { Bar, CartesianChart, Line } from "victory-native";

import {
  ChartTooltipOverlay,
  netTone,
  TwoToneCard,
  type ChartTooltipAnchor,
} from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { DailyCashflowRow } from "@/features/analytics/types";
import { formatInrChartAxis, formatInrCompact } from "@/utils/currency";

import {
  buildCashflowYTickValues,
  buildFullMonthCashflowDays,
  CASHFLOW_DAY_SLOT_WIDTH,
  cashflowChartScrollWidth,
  CHART_LEADING_ANCHOR_DAY,
  chartTrailingAnchorDay,
  formatCashflowXLabel,
} from "../utils/buildCashflowWindow";
import { InsightsCashflowChartSkeleton } from "./InsightsAnalyticsSkeletons";
import {
  NET_DEFICIT_BAR,
  NET_SURPLUS_BAR,
} from "./insightsCashflowChartTokens";

const CHART_PLOT_HEIGHT = 212;
const X_LABEL_ROW_HEIGHT = 22;
const Y_AXIS_GUTTER = 46;

const ZERO_CHART_ROW = {
  expense: 0,
  income: 0,
  netSurplus: 0,
  netDeficit: 0,
} as const;

type CashflowDayPress = {
  day: number;
  date: string;
  expense: number;
  income: number;
  net: number;
};

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

function netBarInnerPadding(dayCount: number): number {
  if (dayCount <= 10) return 0.22;
  if (dayCount <= 20) return 0.14;
  return 0.2;
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
  loading?: boolean;
  /** Parent scroll views can call this ref to dismiss an open day tooltip. */
  tooltipDismissRef?: MutableRefObject<(() => void) | null>;
};

export const InsightsDailyCashflowChart = memo(
  function InsightsDailyCashflowChart({
    dailyCashflow,
    year,
    monthIndex0,
    loading = false,
    tooltipDismissRef,
  }: InsightsDailyCashflowChartProps) {
    const { monthDays, lastDay, todayDay } = useMemo(
      () => buildFullMonthCashflowDays(dailyCashflow, year, monthIndex0),
      [dailyCashflow, monthIndex0, year],
    );

    const scrollWidth = useMemo(
      () => cashflowChartScrollWidth(monthDays.length),
      [monthDays.length],
    );

    const trailingAnchorDay = chartTrailingAnchorDay(lastDay);

    const { chartData, yMax, barPadding, yTickValues } = useMemo(() => {
      const monthRows = monthDays.map((d) => ({
        day: d.day,
        expense: d.expense,
        income: d.income,
        netSurplus: d.net > 0 ? d.net : 0,
        netDeficit: d.net < 0 ? Math.abs(d.net) : 0,
      }));
      const data = [
        { day: CHART_LEADING_ANCHOR_DAY, ...ZERO_CHART_ROW },
        ...monthRows,
        { day: trailingAnchorDay, ...ZERO_CHART_ROW },
      ];
      let maxY = 1;
      for (const d of data) {
        maxY = Math.max(
          maxY,
          d.expense,
          d.income,
          d.netSurplus,
          d.netDeficit,
          0,
        );
      }
      const pad = Math.max(maxY, 1) * 0.1;
      const domainMax = maxY + pad;
      return {
        chartData: data,
        yMax: domainMax,
        barPadding: netBarInnerPadding(monthRows.length),
        yTickValues: buildCashflowYTickValues(domainMax),
      };
    }, [monthDays, trailingAnchorDay]);

    const domain = useMemo(
      () => ({
        x: [CHART_LEADING_ANCHOR_DAY, trailingAnchorDay] as [number, number],
        y: [0, yMax] as [number, number],
      }),
      [trailingAnchorDay, yMax],
    );

    const [selected, setSelected] = useState<SelectedDay | null>(null);

    const dismissTooltip = useCallback(() => {
      setSelected(null);
    }, []);

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

    return (
      <>
        <TwoToneCard
          header={
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Daily cash flow</Text>
              <Text style={styles.headerSubtitle}>
                Income, spending, and net each day
              </Text>
            </View>
          }
          body={
            <View style={styles.body}>
              {loading ? (
                <InsightsCashflowChartSkeleton />
              ) : (
                <>
                  <View style={styles.chartRow}>
                    <View
                      style={[
                        styles.yAxisColumn,
                        { height: CHART_PLOT_HEIGHT },
                      ]}
                    >
                      {[...yTickValues].reverse().map((tick) => (
                        <Text key={`y-${tick}`} style={styles.yAxisLabel}>
                          {formatInrChartAxis(tick)}
                        </Text>
                      ))}
                    </View>

                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      showsHorizontalScrollIndicator
                      style={styles.chartScroll}
                      contentContainerStyle={styles.chartScrollContent}
                      onScrollBeginDrag={dismissTooltip}
                      onMomentumScrollBegin={dismissTooltip}
                    >
                      <View style={{ width: scrollWidth }}>
                        <View
                          style={[
                            styles.chartPlot,
                            { height: CHART_PLOT_HEIGHT, width: scrollWidth },
                          ]}
                        >
                          <CartesianChart
                            data={chartData}
                            xKey="day"
                            yKeys={[
                              "netSurplus",
                              "netDeficit",
                              "expense",
                              "income",
                            ]}
                            domain={domain}
                            padding={{ left: 6, right: 10, top: 8, bottom: 4 }}
                            domainPadding={{
                              left: 10,
                              right: 10,
                              top: 8,
                              bottom: 4,
                            }}
                            axisOptions={{
                              tickCount: { x: 0, y: 0 },
                              lineColor: {
                                grid: {
                                  x: "transparent",
                                  y: colors.borderList,
                                },
                                frame: "transparent",
                              },
                            }}
                            renderOutside={({ points, chartBounds }) => (
                              <Group
                                clip={rect(
                                  chartBounds.left,
                                  chartBounds.top,
                                  chartBounds.right - chartBounds.left,
                                  chartBounds.bottom - chartBounds.top,
                                )}
                              >
                                <Line
                                  points={points.expense}
                                  color={colors.danger}
                                  strokeWidth={2.5}
                                  curveType="monotoneX"
                                />
                                <Line
                                  points={points.income}
                                  color={colors.success}
                                  strokeWidth={2}
                                  curveType="monotoneX"
                                />
                              </Group>
                            )}
                          >
                            {({ points, chartBounds }) => (
                              <>
                                <Bar
                                  points={points.netSurplus}
                                  chartBounds={chartBounds}
                                  color={NET_SURPLUS_BAR}
                                  innerPadding={barPadding}
                                />
                                <Bar
                                  points={points.netDeficit}
                                  chartBounds={chartBounds}
                                  color={NET_DEFICIT_BAR}
                                  innerPadding={barPadding}
                                />
                              </>
                            )}
                          </CartesianChart>

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
                      <View
                        style={[
                          styles.legendLine,
                          { backgroundColor: colors.danger },
                        ]}
                      />
                      <Text style={styles.legendLabel}>Expense</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendLine,
                          { backgroundColor: colors.success },
                        ]}
                      />
                      <Text style={styles.legendLabel}>Income</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendBar,
                          { backgroundColor: NET_SURPLUS_BAR },
                        ]}
                      />
                      <Text style={styles.legendLabel}>Net +</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendBar,
                          { backgroundColor: NET_DEFICIT_BAR },
                        ]}
                      />
                      <Text style={styles.legendLabel}>Net −</Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          }
        />
        <ChartTooltipOverlay
          visible={selected != null && tooltipRows != null}
          onDismiss={dismissTooltip}
          title={tooltipTitle}
          rows={tooltipRows ?? []}
          anchor={selected?.anchorWindow ?? null}
        />
      </>
    );
  },
);

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: bento.onPastel.muted,
  },
  body: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
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
  yAxisLabel: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 8,
    lineHeight: 10,
    color: bento.onPastel.muted,
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
    backgroundColor: "rgba(99, 85, 232, 0.08)",
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
    color: bento.onPastel.muted,
    textAlign: "center",
  },
  xLabelToday: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 8,
    lineHeight: 11,
    color: colors.textPrimary,
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
  legendLine: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  legendBar: {
    width: 8,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 13,
    color: bento.onPastel.muted,
  },
});
