import { StyleSheet, View } from "react-native";

import {
  BENTO_GAP,
  BENTO_TRANSACTION_TILE_MIN_HEIGHT,
} from "@/components/bento";
import { SkeletonBlock, SkeletonStrip } from "@/components/ui";
import { colors, radius, spacing } from "@/constants";

const CHART_PLOT_HEIGHT = 212;
const X_LABEL_ROW_HEIGHT = 22;
const Y_AXIS_GUTTER = 46;
const DONUT_SIZE = 192;
const LEGEND_WIDTH = 168;
const CONTENT_MIN_HEIGHT = 228;

export function InsightsCashflowChartSkeleton() {
  return (
    <View style={styles.cashflowSkel}>
      <View style={styles.cashflowChartRow}>
        <View style={[styles.yAxisSkel, { height: CHART_PLOT_HEIGHT }]}>
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
        </View>
        <SkeletonBlock
          tone="surface"
          style={[styles.plotSkel, { height: CHART_PLOT_HEIGHT }]}
        />
      </View>
      <View style={styles.xLabelsSkel}>
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonBlock key={i} tone="surface" style={styles.xTickSkel} />
        ))}
      </View>
      <View style={styles.legendSkel}>
        <SkeletonBlock tone="surface" style={styles.legendItemSkel} />
        <SkeletonBlock tone="surface" style={styles.legendItemSkel} />
        <SkeletonBlock tone="surface" style={styles.legendItemSkel} />
      </View>
    </View>
  );
}

/** Compact transaction-tile placeholders (max three while loading). */
export function InsightsTopExpensesSkeleton() {
  return (
    <View style={styles.topExpensesSkel}>
      {Array.from({ length: 3 }, (_, i) => (
        <View key={i} style={styles.topExpenseTileSkel}>
          <SkeletonBlock tone="surface" style={styles.topExpenseIconSkel} />
          <View style={styles.topExpenseTextSkel}>
            <SkeletonStrip variant="listTitle" />
            <SkeletonStrip variant="listMeta" />
          </View>
          <SkeletonStrip variant="listAmount" />
        </View>
      ))}
    </View>
  );
}

export function InsightsDonutCardSkeleton() {
  return (
    <View style={styles.donutSkeletonWrap}>
      <View style={styles.donutContentSkel}>
        <SkeletonBlock
          tone="surface"
          style={[
            styles.donutRingSkel,
            { width: DONUT_SIZE, height: DONUT_SIZE },
          ]}
        />
        <View style={styles.legendColSkel}>
          {Array.from({ length: 5 }, (_, i) => (
            <View key={i} style={styles.legendRowSkel}>
              <SkeletonBlock tone="surface" style={styles.legendSwatchSkel} />
              <View style={styles.legendTextSkel}>
                <SkeletonBlock tone="surface" style={styles.legendNameSkel} />
                <SkeletonBlock tone="surface" style={styles.legendMetaSkel} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  donutSkeletonWrap: {
    width: "100%",
    alignItems: "center",
  },
  topExpensesSkel: {
    gap: BENTO_GAP,
  },
  topExpenseTileSkel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: BENTO_TRANSACTION_TILE_MIN_HEIGHT,
    backgroundColor: colors.barBackground,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  topExpenseIconSkel: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  topExpenseTextSkel: {
    flex: 1,
    gap: spacing.xs,
  },
  cashflowSkel: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  cashflowChartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  yAxisSkel: {
    width: Y_AXIS_GUTTER,
    justifyContent: "space-between",
    paddingTop: 10,
    paddingBottom: 4,
    paddingRight: 4,
  },
  yTickSkel: {
    width: 32,
    height: 8,
    borderRadius: radius.sm,
    alignSelf: "flex-end",
  },
  plotSkel: {
    flex: 1,
    borderRadius: radius.md,
  },
  xLabelsSkel: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: Y_AXIS_GUTTER + spacing.xs,
    paddingRight: spacing.xs,
    minHeight: X_LABEL_ROW_HEIGHT,
    alignItems: "center",
  },
  xTickSkel: {
    width: 14,
    height: 8,
    borderRadius: radius.sm,
  },
  legendSkel: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  legendItemSkel: {
    width: 72,
    height: 10,
    borderRadius: radius.sm,
  },
  donutContentSkel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    gap: spacing.lg,
    flexShrink: 1,
    minHeight: CONTENT_MIN_HEIGHT - spacing.sm - spacing.lg,
  },
  donutRingSkel: {
    borderRadius: DONUT_SIZE / 2,
  },
  legendColSkel: {
    width: LEGEND_WIDTH,
    gap: 8,
  },
  legendRowSkel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 5,
  },
  legendSwatchSkel: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendTextSkel: {
    flex: 1,
    gap: 4,
  },
  legendNameSkel: {
    width: "72%",
    height: 12,
    borderRadius: radius.sm,
  },
  legendMetaSkel: {
    width: "48%",
    height: 10,
    borderRadius: radius.sm,
  },
});
