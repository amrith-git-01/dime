import { useIsFocused } from "@react-navigation/native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { INSIGHTS_CHART_BAR_ANIMATION } from "@/features/analytics/constants/chartAnimation";
import { COMPARE_CASHFLOW_PLOT_HEIGHT } from "@/features/analytics/constants/compare";
import { useVictoryChartEntry } from "@/features/analytics/hooks/useVictoryChartEntry";
import type { DailyCashflowRow } from "@/features/analytics/types";
import { zeroCashflowChartRows } from "@/features/analytics/utils/chartEntryData";
import { formatInrChartAxis } from "@/utils/currency";

import {
  buildFullMonthCashflowDays,
  buildMonthlyCashflowChartModel,
  CASHFLOW_DAY_SLOT_WIDTH,
  cashflowChartScrollWidth,
  cashflowScrollOffsetForToday,
  CHART_LEADING_ANCHOR_DAY,
  chartTrailingAnchorDay,
  formatCashflowXLabel,
} from "../../utils/buildCashflowWindow";
import { CashflowVictoryChart } from "../CashflowVictoryChart";
import { createThemedStyles } from "@/theme";

const X_LABEL_ROW_HEIGHT = 18;
const Y_AXIS_GUTTER = 34;

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
  const styles = useStyles();
  const isFocused = useIsFocused();

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

  const { data: entryChartData, animate: chartAnimate } = useVictoryChartEntry({
    identity: `compare-cashflow-${year}-${monthIndex0}`,
    zeroData: zeroChartData,
    targetData: chartData,
    enabled: true,
    isFullyVisible: isFocused,
    animateConfig: INSIGHTS_CHART_BAR_ANIMATION,
  });

  const incomeFlags = useMemo(
    () => entryChartData.map((row) => row.income > 0),
    [entryChartData],
  );

  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    if (!isFocused || todayDay == null || viewportWidth <= 0) {
      return;
    }
    scrollRef.current?.scrollTo({
      x: cashflowScrollOffsetForToday(todayDay, viewportWidth, scrollWidth),
      animated: false,
    });
  }, [isFocused, scrollWidth, todayDay, viewportWidth]);

  return (
    <View style={styles.wrap}>
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
          ref={scrollRef}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.chartScroll}
          contentContainerStyle={styles.chartScrollContent}
          onLayout={(e) => setViewportWidth(e.nativeEvent.layout.width)}
        >
          <View style={{ width: scrollWidth }}>
            <View style={styles.chartPlot}>
              <CashflowVictoryChart
                animate={chartAnimate}
                chartData={entryChartData}
                domain={domain}
                barPadding={barPadding}
                plotHeight={COMPARE_CASHFLOW_PLOT_HEIGHT}
                plotWidth={scrollWidth}
                incomeFlags={incomeFlags}
                todayDay={todayDay}
                chartPadding={{ left: 4, right: 8, top: 10, bottom: 2 }}
                domainPadding={{ left: 8, right: 8, top: 10, bottom: 2 }}
              />
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

const useStyles = createThemedStyles(({ colors }) => ({
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
    color: colors.inkFaint,
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
    color: colors.inkFaint,
    textAlign: "center",
  },
  xLabelToday: {
    fontFamily: fontFamilies.semiBold,
    color: colors.ink,
  },
}));
