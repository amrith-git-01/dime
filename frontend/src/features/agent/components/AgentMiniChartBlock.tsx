import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { colors, radius, spacing } from "@/constants";

import type { AgentBlockMiniChart } from "../types";
import { buildAgentChartRevealKey } from "../utils/buildAgentChartRevealKey";

import { AgentCashflowBarChart } from "./AgentCashflowBarChart";
import { AgentCompareBarChart } from "./AgentCompareBarChart";
import { AgentDonutChart } from "./AgentDonutChart";

type AgentMiniChartBlockProps = {
  block: AgentBlockMiniChart;
};

export const AgentMiniChartBlock = memo(function AgentMiniChartBlock({
  block,
}: AgentMiniChartBlockProps) {
  const {
    title,
    series,
    points,
    compare_series,
    period_a_label,
    period_b_label,
  } = block.payload;
  const revealKey = buildAgentChartRevealKey(block);

  return (
    <View style={styles.wrap}>
      {block.chart_kind === "donut" ? (
        <AgentDonutChart
          title={title}
          series={series?.filter((s) => s.value > 0) ?? []}
          revealKey={revealKey}
        />
      ) : block.chart_kind === "compare_bar" ? (
        <AgentCompareBarChart
          title={title}
          periodALabel={period_a_label ?? "Period A"}
          periodBLabel={period_b_label ?? "Period B"}
          series={compare_series ?? []}
          revealKey={revealKey}
        />
      ) : (
        <AgentCashflowBarChart
          title={title}
          points={points?.filter((p) => p.amount >= 0) ?? []}
          revealKey={revealKey}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.pageBackground,
    overflow: "visible",
  },
});
