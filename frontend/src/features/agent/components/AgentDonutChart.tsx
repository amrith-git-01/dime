import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { ClockwiseAnimatedPie } from "@/features/analytics/components/ClockwiseAnimatedPie";
import { formatInrCompact } from "@/utils/currency";

import { useAgentDonutReveal } from "../hooks/useAgentChartReveal";
import {
  buildAgentDonutData,
  type AgentDonutSeriesItem,
} from "../utils/buildAgentDonutData";

const CHART_SIZE = 132;
const INNER_RADIUS_RATIO = 0.58;

type AgentDonutChartProps = {
  title?: string;
  series: AgentDonutSeriesItem[];
  revealKey: string;
};

export const AgentDonutChart = memo(function AgentDonutChart({
  title,
  series,
  revealKey,
}: AgentDonutChartProps) {
  const chartData = useMemo(() => buildAgentDonutData(series), [series]);
  const total = useMemo(
    () => chartData.reduce((sum, slice) => sum + slice.value, 0),
    [chartData],
  );
  const pieProgress = useAgentDonutReveal(revealKey);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <View style={styles.root}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.row}>
        <View
          style={[styles.chartWrap, { width: CHART_SIZE, height: CHART_SIZE }]}
        >
          <ClockwiseAnimatedPie
            data={chartData}
            size={CHART_SIZE}
            innerRadiusRatio={INNER_RADIUS_RATIO}
            progress={pieProgress}
          />
        </View>
        <View style={styles.legend}>
          {chartData.map((slice) => (
            <View key={slice.payee_key} style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: slice.color }]} />
              <Text style={styles.legendName} numberOfLines={1}>
                {slice.display_name}
              </Text>
              <Text style={styles.legendValue}>
                {formatInrCompact(slice.value)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={styles.total}>Total {formatInrCompact(total)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  chartWrap: {
    overflow: "hidden",
  },
  legend: {
    flex: 1,
    gap: spacing.xs,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendName: {
    flex: 1,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  legendValue: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  total: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
