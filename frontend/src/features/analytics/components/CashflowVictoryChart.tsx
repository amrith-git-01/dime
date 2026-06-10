import { Group, rect } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Bar, CartesianChart, Line } from "victory-native";

import { colors } from "@/constants";
import {
  INSIGHTS_CHART_BAR_ANIMATION,
  INSIGHTS_CHART_LINE_ANIMATION,
} from "@/features/analytics/constants/chartAnimation";
import { useChartPathAnimation } from "@/features/analytics/hooks/useChartPathAnimation";

import {
  NET_DEFICIT_BAR,
  NET_SURPLUS_BAR,
} from "./insightsCashflowChartTokens";

type CashflowChartRow = {
  day: number;
  expense: number;
  income: number;
  netSurplus: number;
  netDeficit: number;
};

export type CashflowVictoryChartProps = {
  animationKey: string;
  chartData: CashflowChartRow[];
  domain: {
    x: [number, number];
    y: [number, number];
  };
  barPadding: number;
  plotHeight: number;
  plotWidth: number;
  expenseStrokeWidth?: number;
  incomeStrokeWidth?: number;
  chartPadding?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  domainPadding?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
};

export const CashflowVictoryChart = memo(function CashflowVictoryChart({
  animationKey,
  chartData,
  domain,
  barPadding,
  plotHeight,
  plotWidth,
  expenseStrokeWidth = 2.5,
  incomeStrokeWidth = 2,
  chartPadding = { left: 6, right: 10, top: 8, bottom: 4 },
  domainPadding = { left: 10, right: 10, top: 8, bottom: 4 },
}: CashflowVictoryChartProps) {
  const barAnimate = useChartPathAnimation(
    `${animationKey}:bar`,
    INSIGHTS_CHART_BAR_ANIMATION,
  );
  const lineAnimate = useChartPathAnimation(
    `${animationKey}:line`,
    INSIGHTS_CHART_LINE_ANIMATION,
  );

  const barCount = chartData.length;

  const lineProps = useMemo(
    () => ({
      curveType: "monotoneX" as const,
      connectMissingData: true,
    }),
    [],
  );

  return (
    <View style={[styles.plot, { height: plotHeight, width: plotWidth }]}>
      <CartesianChart
        data={chartData}
        xKey="day"
        yKeys={["netSurplus", "netDeficit", "expense", "income"]}
        domain={domain}
        padding={chartPadding}
        domainPadding={domainPadding}
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
              strokeWidth={expenseStrokeWidth}
              animate={lineAnimate}
              {...lineProps}
            />
            <Line
              points={points.income}
              color={colors.success}
              strokeWidth={incomeStrokeWidth}
              animate={lineAnimate}
              {...lineProps}
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
              barCount={barCount}
              animate={barAnimate}
            />
            <Bar
              points={points.netDeficit}
              chartBounds={chartBounds}
              color={NET_DEFICIT_BAR}
              innerPadding={barPadding}
              barCount={barCount}
              animate={barAnimate}
            />
          </>
        )}
      </CartesianChart>
    </View>
  );
});

const styles = StyleSheet.create({
  plot: {
    position: "relative",
  },
});
