import { useIsFocused } from "@react-navigation/native";
import { format } from "date-fns";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { bento, hero, radius } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { useChartRevealOnce } from "@/features/analytics/hooks/useChartRevealOnce";
import { buildClusteredCashflowScale } from "@/features/analytics/utils/cashflowClusterScale";

const CHART_LABEL_ROW_HEIGHT = 16;
const BAR_DURATION = 600;
const BAR_STAGGER = 35;
const MIN_BAR_PX = 3;
const ACTIVE_OPACITY = 1;
const INACTIVE_OPACITY = 0.32;

export type VictorySparkBarDay = {
  date: string;
  total: number;
};

export type VictorySparkBarChartProps = {
  /** Oldest → newest; length 7 */
  days: VictorySparkBarDay[];
  barColor?: string;
  labelColor?: string;
  activeLabelColor?: string;
  /** Bar plot area height (labels add {@link CHART_LABEL_ROW_HEIGHT}px). */
  height?: number;
  revealIdentity: string;
  revealEnabled?: boolean;
};

const SingleBar = memo(function SingleBar({
  targetHeight,
  isActive,
  color,
  index,
  hasPlayed,
  revealGeneration,
  revealEnabled,
}: {
  targetHeight: number;
  isActive: boolean;
  color: string;
  index: number;
  hasPlayed: boolean;
  revealGeneration: number;
  revealEnabled: boolean;
}) {
  const h = useSharedValue(MIN_BAR_PX);
  const op = useSharedValue(0);

  useEffect(() => {
    const finalH = Math.max(MIN_BAR_PX, targetHeight);
    const finalOp = isActive ? ACTIVE_OPACITY : INACTIVE_OPACITY;

    if (hasPlayed || !revealEnabled) {
      h.value = finalH;
      op.value = finalOp;
      return;
    }

    if (revealGeneration === 0) {
      h.value = MIN_BAR_PX;
      op.value = 0;
      return;
    }

    h.value = MIN_BAR_PX;
    op.value = 0;
    const delay = index * BAR_STAGGER;
    h.value = withDelay(delay, withTiming(finalH, { duration: BAR_DURATION }));
    op.value = withDelay(delay, withTiming(finalOp, { duration: 300 }));
  }, [
    h,
    op,
    targetHeight,
    isActive,
    hasPlayed,
    revealGeneration,
    index,
    revealEnabled,
  ]);

  const style = useAnimatedStyle(() => ({
    height: h.value,
    opacity: op.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, borderRadius: radius.xs },
        style,
      ]}
    />
  );
});

/** Mini 7-day debit bar chart — active bar full opacity, inactive bars dimmed. */
export const VictorySparkBarChart = memo(function VictorySparkBarChart({
  days,
  barColor = hero.sparkBar,
  labelColor = bento.onSurface.muted,
  activeLabelColor = bento.onSurface.primary,
  height = 40,
  revealIdentity,
  revealEnabled = true,
}: VictorySparkBarChartProps) {
  const isFocused = useIsFocused();
  const [revealGeneration, setRevealGeneration] = useState(0);

  const startReveal = useCallback(() => {
    setRevealGeneration((generation) => generation + 1);
  }, []);

  const resetReveal = useCallback(() => {
    setRevealGeneration(0);
  }, []);

  const completeAfterMs =
    BAR_DURATION + Math.max(0, days.length - 1) * BAR_STAGGER + 80;

  const { hasPlayed } = useChartRevealOnce({
    identity: revealIdentity,
    enabled: revealEnabled,
    isVisible: isFocused,
    completeAfterMs,
    onStartReveal: startReveal,
    onReset: resetReveal,
  });

  // Resolve today by actual date string, not by array position.
  // This stays correct even when MMKV-cached data is from the previous day.
  const todayDateStr = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const todayIndex = useMemo(
    () => days.findIndex((d) => d.date === todayDateStr),
    [days, todayDateStr],
  );

  const yScale = useMemo(
    () => buildClusteredCashflowScale(days.map((d) => d.total)),
    [days],
  );

  const chartHeight = height + CHART_LABEL_ROW_HEIGHT;

  return (
    <View style={[styles.root, { height: chartHeight }]}>
      <View style={[styles.barsRow, { height }]}>
        {days.map((day, index) => {
          const scaled = yScale.toScaleValue(day.total);
          const barH = Math.max(
            MIN_BAR_PX,
            (scaled / yScale.yDomainMax) * height,
          );
          return (
            <View key={day.date} style={styles.barCol}>
              <SingleBar
                targetHeight={barH}
                isActive={todayIndex >= 0 && index === todayIndex}
                color={barColor}
                index={index}
                hasPlayed={hasPlayed}
                revealGeneration={revealGeneration}
                revealEnabled={revealEnabled && isFocused}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.labelsRow}>
        {days.map((day, index) => {
          const isToday = todayIndex >= 0 && index === todayIndex;
          return (
            <Text
              key={`${day.date}-label`}
              style={[
                styles.dayLabel,
                { color: isToday ? activeLabelColor : labelColor },
                isToday ? styles.dayLabelActive : styles.dayLabelInactive,
              ]}
            >
              {format(new Date(`${day.date}T12:00:00`), "EEEEE")}
            </Text>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    justifyContent: "flex-end",
  },
  barsRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
  },
  labelsRow: {
    flexDirection: "row",
    marginTop: 4,
    gap: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamilies.medium,
    fontSize: 9,
    lineHeight: 12,
  },
  dayLabelInactive: {
    opacity: 0.55,
  },
  dayLabelActive: {
    opacity: 1,
    fontFamily: fontFamilies.semiBold,
  },
});
