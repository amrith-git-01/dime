import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";

const CHART_PLOT_HEIGHT = 212;
const X_LABEL_ROW_HEIGHT = 22;
const Y_AXIS_GUTTER = 46;
const DONUT_SIZE = 192;
const LEGEND_WIDTH = 168;
const CONTENT_MIN_HEIGHT = 228;

export function InsightsMonthSummaryHeaderSkeleton() {
  return (
    <View style={styles.headerLeftSkel}>
      <SkeletonBlock tone="surface" style={styles.kickerSkel} />
      <SkeletonBlock tone="surface" style={styles.titleSkel} />
    </View>
  );
}

export function InsightsMonthSummaryBodySkeleton() {
  return (
    <View style={styles.summaryBodySkel}>
      <View style={styles.statsRowSkel}>
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
      </View>
      <SkeletonBlock tone="surface" style={styles.sectionDividerSkel} />
      <SkeletonBlock tone="surface" style={styles.sectionKickerSkel} />
      <View style={styles.statsRowSkel}>
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
      </View>
    </View>
  );
}

export function InsightsBurnRateBodySkeleton() {
  return (
    <View style={styles.burnRateBodySkel}>
      <View style={styles.statsRowSkel}>
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
        <SkeletonBlock tone="surface" style={styles.statCellSkel} />
      </View>
    </View>
  );
}

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

export function InsightsTopExpensesSkeleton() {
  return (
    <View style={styles.topExpensesSkel}>
      {Array.from({ length: 5 }, (_, i) => (
        <View key={i} style={styles.topExpenseRowSkel}>
          <View style={styles.topExpenseHeaderSkel}>
            <SkeletonBlock tone="surface" style={styles.topExpenseNameSkel} />
            <SkeletonBlock tone="surface" style={styles.topExpenseAmountSkel} />
          </View>
          <SkeletonBlock tone="surface" style={styles.topExpenseMetaSkel} />
          <SkeletonBlock tone="surface" style={styles.topExpenseBarSkel} />
        </View>
      ))}
    </View>
  );
}

export function InsightsDonutCardSkeleton() {
  return (
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
  );
}

const styles = StyleSheet.create({
  headerLeftSkel: {
    flex: 1,
    gap: 6,
  },
  kickerSkel: {
    width: 72,
    height: 10,
    borderRadius: radius.sm,
  },
  titleSkel: {
    width: "55%",
    height: 22,
    borderRadius: radius.sm,
  },
  summaryBodySkel: {
    gap: spacing.md,
  },
  statsRowSkel: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCellSkel: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
  },
  sectionDividerSkel: {
    width: "100%",
    height: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
  },
  sectionKickerSkel: {
    width: 56,
    height: 10,
    borderRadius: radius.sm,
  },
  burnRateBodySkel: {
    minHeight: 72,
  },
  topExpensesSkel: {
    gap: spacing.md,
  },
  topExpenseRowSkel: {
    gap: 6,
  },
  topExpenseHeaderSkel: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  topExpenseNameSkel: {
    flex: 1,
    height: 14,
    borderRadius: radius.sm,
  },
  topExpenseAmountSkel: {
    width: 64,
    height: 14,
    borderRadius: radius.sm,
  },
  topExpenseMetaSkel: {
    width: "48%",
    height: 10,
    borderRadius: radius.sm,
  },
  topExpenseBarSkel: {
    width: "100%",
    height: 6,
    borderRadius: 3,
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
    width: "100%",
    maxWidth: DONUT_SIZE + LEGEND_WIDTH + spacing.lg,
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
