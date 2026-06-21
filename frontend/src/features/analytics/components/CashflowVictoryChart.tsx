import { Circle } from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Bar, CartesianChart } from "victory-native";

import { accent, colors } from "@/constants";
import type { ChartPathAnimationConfig } from "@/features/analytics/constants/chartAnimation";

const INCOME_DOT_RADIUS = 3;
const TODAY_DOT_RADIUS = 3.5;
const DOT_GAP = 3;

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
  /** Indices into chartData where income > 0 (for green dot indicators). */
  incomeFlags: boolean[];
  /** 1-based day number for current month today indicator (null for past/future). */
  todayDay: number | null;
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
  incomeFlags,
  todayDay,
  chartPadding = { left: 6, right: 10, top: 16, bottom: 4 },
  domainPadding = { left: 10, right: 10, top: 16, bottom: 4 },
}: CashflowVictoryChartProps) {
  const barCount = chartData.length;

  // Map day → index in chartData for quick lookup in render prop
  const dayToIndex = useMemo(() => {
    const m = new Map<number, number>();
    chartData.forEach((row, i) => m.set(row.day, i));
    return m;
  }, [chartData]);

  return (
    <View style={[styles.plot, { height: plotHeight, width: plotWidth }]}>
      <CartesianChart
        data={chartData}
        xKey="day"
        yKeys={["expense"]}
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
            {/* Expense bars — accent indigo fill */}
            <Bar
              points={points.expense}
              chartBounds={chartBounds}
              color={accent}
              innerPadding={barPadding}
              barCount={barCount}
              animate={animate}
            />

            {/* Income dots — small green circles above the expense bar */}
            {points.expense.map((pt, i) => {
              if (!incomeFlags[i] || pt.x === undefined) return null;
              const barTop = pt.y ?? chartBounds.bottom;
              const cy = Math.max(
                chartBounds.top + INCOME_DOT_RADIUS,
                barTop - INCOME_DOT_RADIUS - DOT_GAP,
              );
              return (
                <Circle
                  key={`income-${i}`}
                  cx={pt.x}
                  cy={cy}
                  r={INCOME_DOT_RADIUS}
                  color={colors.success}
                />
              );
            })}

            {/* Today marker — filled accent dot above today's bar */}
            {todayDay != null &&
              (() => {
                const idx = dayToIndex.get(todayDay);
                if (idx === undefined) return null;
                const pt = points.expense[idx];
                if (!pt || pt.x === undefined) return null;
                // Income dot already there? Stack today dot further up
                const hasIncome = incomeFlags[idx];
                const barTop = pt.y ?? chartBounds.bottom;
                const cy = Math.max(
                  chartBounds.top + TODAY_DOT_RADIUS,
                  barTop -
                    TODAY_DOT_RADIUS -
                    DOT_GAP -
                    (hasIncome ? INCOME_DOT_RADIUS * 2 + DOT_GAP : 0),
                );
                return (
                  <Circle
                    key="today"
                    cx={pt.x}
                    cy={cy}
                    r={TODAY_DOT_RADIUS}
                    color={accent}
                  />
                );
              })()}
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
