import { memo, useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formatInrCompact } from "@/utils/currency";

import { AGENT_BAR_CHART_TIMING } from "../hooks/useAgentChartReveal";
import { createThemedStyles, useTheme } from "@/theme";

const MAX_BAR_WIDTH = 120;
const BAR_HEIGHT = 7;

export type CompareSeriesItem = {
  name: string;
  period_a: number;
  period_b: number;
};

type AgentCompareBarChartProps = {
  title?: string;
  periodALabel: string;
  periodBLabel: string;
  series: CompareSeriesItem[];
  revealKey: string;
};

const AnimatedBar = memo(function AnimatedBar({
  targetWidth,
  color,
  revealKey,
}: {
  targetWidth: number;
  color: string;
  revealKey: string;
}) {
  const styles = useStyles();
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = 0;
    width.value = withTiming(Math.max(targetWidth, 2), AGENT_BAR_CHART_TIMING);
  }, [width, targetWidth, revealKey]);

  const style = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, height: BAR_HEIGHT },
        style,
      ]}
    />
  );
});

export const AgentCompareBarChart = memo(function AgentCompareBarChart({
  title,
  periodALabel,
  periodBLabel,
  series,
  revealKey,
}: AgentCompareBarChartProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const COLOR_A = colors.accentText;
  const COLOR_B = colors.inkSoft;
  const maxValue = useMemo(
    () => Math.max(1, ...series.flatMap((s) => [s.period_a, s.period_b])),
    [series],
  );

  if (series.length === 0) {
    return null;
  }

  return (
    <View style={styles.root}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <View style={styles.rows}>
        {series.map((item) => {
          const wA = (item.period_a / maxValue) * MAX_BAR_WIDTH;
          const wB = (item.period_b / maxValue) * MAX_BAR_WIDTH;
          const diff =
            item.period_b > 0
              ? ((item.period_a - item.period_b) / item.period_b) * 100
              : 0;
          const diffLabel =
            diff > 0
              ? `+${diff.toFixed(0)}%`
              : diff < 0
                ? `${diff.toFixed(0)}%`
                : "—";
          const diffColor =
            diff < 0
              ? colors.success
              : diff > 0
                ? colors.danger
                : colors.inkSoft;

          return (
            <View key={item.name} style={styles.row}>
              <Text style={styles.categoryName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.barsCol}>
                <View style={styles.barRow}>
                  <View style={styles.barTrack}>
                    <AnimatedBar
                      targetWidth={wA}
                      color={COLOR_A}
                      revealKey={revealKey}
                    />
                  </View>
                  <Text style={styles.amount}>
                    {formatInrCompact(item.period_a)}
                  </Text>
                </View>
                <View style={styles.barRow}>
                  <View style={styles.barTrack}>
                    <AnimatedBar
                      targetWidth={wB}
                      color={COLOR_B}
                      revealKey={revealKey}
                    />
                  </View>
                  <Text style={[styles.amount, styles.amountB]}>
                    {formatInrCompact(item.period_b)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.diffLabel, { color: diffColor }]}>
                {diffLabel}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLOR_A }]} />
          <Text style={styles.legendLabel}>{periodALabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLOR_B }]} />
          <Text style={styles.legendLabel}>{periodBLabel}</Text>
        </View>
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    color: colors.ink,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryName: {
    width: 72,
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.ink,
  },
  barsCol: {
    flex: 1,
    gap: 4,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  barTrack: {
    width: MAX_BAR_WIDTH,
    justifyContent: "flex-start",
  },
  bar: {
    borderRadius: 3,
    minWidth: 2,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 10,
    color: colors.ink,
    minWidth: 36,
  },
  amountB: {
    color: colors.inkSoft,
  },
  diffLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    minWidth: 36,
    textAlign: "right",
  },
  legend: {
    flexDirection: "row",
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    color: colors.inkSoft,
  },
}));
