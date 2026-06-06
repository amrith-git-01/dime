import { Group, rect } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Bar, CartesianChart, Line } from "victory-native";

import { bento, colors } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { COMPARE_CASHFLOW_PLOT_HEIGHT } from "@/features/analytics/constants/compare";
import type { DailyCashflowRow } from "@/features/analytics/types";
import { formatInrChartAxis } from "@/utils/currency";

import {
  buildCashflowChartScale,
  buildFullMonthCashflowDays,
  CASHFLOW_DAY_SLOT_WIDTH,
  cashflowChartScrollWidth,
  CHART_LEADING_ANCHOR_DAY,
  chartTrailingAnchorDay,
  formatCashflowXLabel,
  maxCashflowChartY,
} from "../../utils/buildCashflowWindow";
import {
  NET_DEFICIT_BAR,
  NET_SURPLUS_BAR,
} from "../insightsCashflowChartTokens";

const X_LABEL_ROW_HEIGHT = 18;
const Y_AXIS_GUTTER = 34;

const ZERO_CHART_ROW = {
  expense: 0,
  income: 0,
  netSurplus: 0,
  netDeficit: 0,
} as const;

function netBarInnerPadding(dayCount: number): number {
  if (dayCount <= 10) return 0.22;
  if (dayCount <= 20) return 0.14;
  return 0.2;
}

export type CompareCashflowColumnProps = {
  dailyCashflow: DailyCashflowRow[];
  year: number;
  monthIndex0: number;
};

export const CompareCashflowColumn = memo(function CompareCashflowColumn({
  dailyCashflow,
  year,
  monthIndex0,
}: CompareCashflowColumnProps) {
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
    const { yDomainMax, yTickValues } = buildCashflowChartScale(
      maxCashflowChartY(data),
    );
    return {
      chartData: data,
      yMax: yDomainMax,
      barPadding: netBarInnerPadding(monthRows.length),
      yTickValues,
    };
  }, [monthDays, trailingAnchorDay]);

  const domain = useMemo(
    () => ({
      x: [CHART_LEADING_ANCHOR_DAY, trailingAnchorDay] as [number, number],
      y: [0, yMax] as [number, number],
    }),
    [trailingAnchorDay, yMax],
  );

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.chartRow}>
        <View
          style={[
            styles.yAxisColumn,
            { height: COMPARE_CASHFLOW_PLOT_HEIGHT },
            yTickValues.length === 1 && styles.yAxisColumnOriginOnly,
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
          showsHorizontalScrollIndicator={false}
          style={styles.chartScroll}
          contentContainerStyle={styles.chartScrollContent}
        >
          <View style={{ width: scrollWidth }}>
            <View
              style={[
                styles.chartPlot,
                {
                  height: COMPARE_CASHFLOW_PLOT_HEIGHT,
                  width: scrollWidth,
                },
              ]}
            >
              <CartesianChart
                data={chartData}
                xKey="day"
                yKeys={["netSurplus", "netDeficit", "expense", "income"]}
                domain={domain}
                padding={{ left: 4, right: 8, top: 6, bottom: 2 }}
                domainPadding={{ left: 8, right: 8, top: 6, bottom: 2 }}
                axisOptions={{
                  tickCount: { x: 0, y: 0 },
                  lineColor: {
                    grid: { x: "transparent", y: colors.borderList },
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
                      strokeWidth={2}
                      curveType="monotoneX"
                    />
                    <Line
                      points={points.income}
                      color={colors.success}
                      strokeWidth={1.5}
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
            </View>

            <View style={[styles.xLabelsRow, { height: X_LABEL_ROW_HEIGHT }]}>
              <View
                style={[styles.xLabelCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]}
              />
              {monthDays.map((d) => {
                const isToday = todayDay != null && d.day === todayDay;
                return (
                  <View
                    key={d.date}
                    style={[
                      styles.xLabelCell,
                      { width: CASHFLOW_DAY_SLOT_WIDTH },
                    ]}
                  >
                    <Text
                      style={[styles.xLabelText, isToday && styles.xLabelToday]}
                      numberOfLines={1}
                    >
                      {formatCashflowXLabel(d.day, todayDay)}
                    </Text>
                  </View>
                );
              })}
              <View
                style={[styles.xLabelCell, { width: CASHFLOW_DAY_SLOT_WIDTH }]}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  yAxisColumn: {
    width: Y_AXIS_GUTTER,
    justifyContent: "space-between",
    paddingTop: 6,
    paddingBottom: 2,
    paddingRight: 2,
  },
  yAxisColumnOriginOnly: {
    justifyContent: "flex-end",
    paddingTop: 0,
  },
  yAxisLabel: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 7,
    lineHeight: 9,
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
  xLabelsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 1,
  },
  xLabelCell: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  xLabelText: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 7,
    lineHeight: 10,
    color: bento.onPastel.muted,
    textAlign: "center",
  },
  xLabelToday: {
    fontFamily: fontFamilies.semiBold,
    color: colors.textPrimary,
  },
});
