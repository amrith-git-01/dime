import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";

import {
  HOME_SPEND_CHART_BAR_HEIGHT,
  HOME_SPEND_RING_SIZE,
} from "./homeBentoTokens";

type BentoSevenDayBarChartSkeletonProps = {
  barHeight?: number;
};

/** Bar plot placeholder matching {@link VictorySparkBarChart} slot. */
export const BentoSevenDayBarChartSkeleton = memo(
  function BentoSevenDayBarChartSkeleton({
    barHeight = HOME_SPEND_CHART_BAR_HEIGHT,
  }: BentoSevenDayBarChartSkeletonProps) {
    return (
      <View style={[styles.chart, { minHeight: barHeight + spacing.sm }]}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBlock
            key={i}
            tone="onPrimary"
            style={[
              styles.bar,
              {
                height: Math.max(
                  8,
                  Math.round(barHeight * (0.25 + (i % 3) * 0.2)),
                ),
              },
            ]}
          />
        ))}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    flex: 1,
    minHeight: HOME_SPEND_RING_SIZE + spacing.sm,
    marginVertical: spacing.xs,
  },
  bar: {
    flex: 1,
    borderRadius: radius.xs,
  },
});
