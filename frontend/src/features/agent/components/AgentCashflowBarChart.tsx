import { memo, useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { buildClusteredCashflowScale } from "@/features/analytics/utils/cashflowClusterScale";
import { formatInrChartAxis, formatInrCompact } from "@/utils/currency";

import {
  AGENT_BAR_CHART_TIMING,
  AGENT_BAR_STAGGER_MAX_BARS,
  AGENT_BAR_STAGGER_MS,
} from "../hooks/useAgentChartReveal";
import {
  parseAgentCashflowPoints,
  type AgentCashflowPoint,
} from "../utils/parseAgentCashflowPoints";

const BAR_SLOT_WIDTH = 36;
const CHART_HEIGHT = 120;
const Y_AXIS_GUTTER = 48;
const X_LABEL_ROW_HEIGHT = 58;
const PLOT_LEFT_INSET = spacing.sm;
const CHART_ROW_GAP = spacing.sm;
/** Horizontal space for date text before −90° rotation (prevents wrapping). */
const X_LABEL_TEXT_WIDTH = 52;
const AXIS_COLOR = colors.cardBorder;

type AgentCashflowBarChartProps = {
  title?: string;
  points: AgentCashflowPoint[];
  revealKey: string;
};

const AnimatedCashflowBar = memo(function AnimatedCashflowBar({
  targetHeight,
  index,
  barCount,
  revealKey,
}: {
  targetHeight: number;
  index: number;
  barCount: number;
  revealKey: string;
}) {
  const animatedHeight = useSharedValue(2);

  useEffect(() => {
    animatedHeight.value = 2;
    const delayMs =
      barCount <= AGENT_BAR_STAGGER_MAX_BARS ? index * AGENT_BAR_STAGGER_MS : 0;
    const timer = setTimeout(() => {
      animatedHeight.value = withTiming(targetHeight, AGENT_BAR_CHART_TIMING);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [animatedHeight, barCount, index, revealKey, targetHeight]);

  const barStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
  }));

  return <Animated.View style={[styles.bar, barStyle]} />;
});

const PerpendicularXLabel = memo(function PerpendicularXLabel({
  label,
}: {
  label: string;
}) {
  return (
    <View style={styles.xLabelCol}>
      <Text
        numberOfLines={1}
        ellipsizeMode="clip"
        style={styles.perpendicularLabel}
      >
        {label}
      </Text>
    </View>
  );
});

export const AgentCashflowBarChart = memo(function AgentCashflowBarChart({
  title,
  points,
  revealKey,
}: AgentCashflowBarChartProps) {
  const days = useMemo(() => parseAgentCashflowPoints(points), [points]);
  const yScale = useMemo(
    () => buildClusteredCashflowScale(days.map((day) => day.amount)),
    [days],
  );
  const scrollWidth = Math.max(days.length * BAR_SLOT_WIDTH, BAR_SLOT_WIDTH);

  if (days.length === 0) {
    return null;
  }

  return (
    <View style={styles.root}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <View style={styles.chartRow}>
        <View
          style={[
            styles.yAxisColumn,
            { height: CHART_HEIGHT },
            yScale.yTickLabels.length === 1 && styles.yAxisColumnOriginOnly,
          ]}
        >
          {[...yScale.yTickLabels].reverse().map((tick) => (
            <Text key={`y-${tick}`} style={styles.yAxisLabel}>
              {formatInrChartAxis(tick)}
            </Text>
          ))}
        </View>

        <View style={styles.plotArea}>
          <View style={[styles.yAxisLine, { height: CHART_HEIGHT }]} />

          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { width: scrollWidth + PLOT_LEFT_INSET },
            ]}
          >
            <View style={[styles.scrollInner, { width: scrollWidth }]}>
              <View style={[styles.barsRow, { height: CHART_HEIGHT }]}>
                {yScale.yTickLabels.map((tick, tickIndex) => {
                  if (tickIndex <= 0) {
                    return null;
                  }
                  const fromBottom =
                    (tickIndex / yScale.yDomainMax) * CHART_HEIGHT;
                  return (
                    <View
                      key={`grid-${tick}`}
                      pointerEvents="none"
                      style={[
                        styles.gridLine,
                        { bottom: fromBottom, width: scrollWidth },
                      ]}
                    />
                  );
                })}

                {days.map((day, index) => {
                  const scaled = yScale.toScaleValue(day.amount);
                  const barHeight =
                    day.amount <= 0
                      ? 2
                      : Math.max(
                          4,
                          Math.round(
                            (scaled / yScale.yDomainMax) * CHART_HEIGHT,
                          ),
                        );
                  return (
                    <View key={day.date} style={styles.barCol}>
                      <AnimatedCashflowBar
                        targetHeight={barHeight}
                        index={index}
                        barCount={days.length}
                        revealKey={revealKey}
                      />
                    </View>
                  );
                })}
              </View>

              <View style={styles.xAxisLine} />

              <View style={[styles.xLabelsRow, { height: X_LABEL_ROW_HEIGHT }]}>
                {days.map((day) => (
                  <PerpendicularXLabel
                    key={`${day.date}-label`}
                    label={day.label}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      <Text style={styles.meta}>
        {days.length} days · peak {formatInrCompact(yScale.rawMax)}
      </Text>
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
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: CHART_ROW_GAP,
  },
  yAxisColumn: {
    width: Y_AXIS_GUTTER,
    justifyContent: "space-between",
    paddingRight: spacing.xs,
    paddingTop: 2,
    paddingBottom: 2,
  },
  yAxisColumnOriginOnly: {
    justifyContent: "flex-end",
    paddingTop: 0,
  },
  yAxisLabel: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 8,
    lineHeight: 10,
    color: colors.textSecondary,
    textAlign: "right",
  },
  plotArea: {
    flex: 1,
    position: "relative",
    paddingLeft: PLOT_LEFT_INSET,
  },
  scrollContent: {
    paddingRight: spacing.xs,
  },
  scrollInner: {
    overflow: "visible",
  },
  yAxisLine: {
    position: "absolute",
    left: PLOT_LEFT_INSET,
    top: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: AXIS_COLOR,
    zIndex: 2,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    position: "relative",
    overflow: "hidden",
  },
  gridLine: {
    position: "absolute",
    left: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: AXIS_COLOR,
    opacity: 0.45,
  },
  barCol: {
    width: BAR_SLOT_WIDTH,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 4,
    zIndex: 1,
  },
  bar: {
    width: "100%",
    borderRadius: 4,
    backgroundColor: colors.headerGradientStart,
    opacity: 0.88,
  },
  xAxisLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AXIS_COLOR,
    width: "100%",
    marginTop: spacing.xs,
  },
  xLabelsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: spacing.sm,
    overflow: "visible",
  },
  xLabelCol: {
    width: BAR_SLOT_WIDTH,
    height: X_LABEL_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
    paddingTop: spacing.xs,
  },
  perpendicularLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 9,
    lineHeight: 12,
    color: colors.textSecondary,
    width: X_LABEL_TEXT_WIDTH,
    textAlign: "left",
    transform: [{ rotate: "-90deg" }, { translateX: 4 }],
  },
  meta: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
