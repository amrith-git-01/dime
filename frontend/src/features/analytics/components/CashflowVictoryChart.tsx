import { Group, rect } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Bar, CartesianChart, Line } from "victory-native";

import { colors } from "@/constants";
import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";

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
  /** Victory animates when the path changes — pass during zero → target entry. */
  animate?: ChartPathAnimationConfig;
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
  animate,
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
      >
        {({ points, chartBounds }) => (
          <>
            <Bar
              points={points.netSurplus}
              chartBounds={chartBounds}
              color={NET_SURPLUS_BAR}
              innerPadding={barPadding}
              barCount={barCount}
              animate={animate}
            />
            <Bar
              points={points.netDeficit}
              chartBounds={chartBounds}
              color={NET_DEFICIT_BAR}
              innerPadding={barPadding}
              barCount={barCount}
              animate={animate}
            />
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
                animate={animate}
                {...lineProps}
              />
              <Line
                points={points.income}
                color={colors.success}
                strokeWidth={incomeStrokeWidth}
                animate={animate}
                {...lineProps}
              />
            </Group>
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
