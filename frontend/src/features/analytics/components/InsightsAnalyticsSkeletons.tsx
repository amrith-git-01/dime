import { StyleSheet, View } from "react-native";

import { TransactionRowListSkeleton } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";

import { PAYEE_DONUT_LEGEND_MAX_WIDTH } from "./PayeeDonutLegendList";

const CHART_PLOT_HEIGHT = 212;
const X_LABEL_ROW_HEIGHT = 22;
const Y_AXIS_GUTTER = 46;
const DONUT_SIZE = 192;
const CONTENT_MIN_HEIGHT = 240;

/**
 * Bar heights as a fraction of CHART_PLOT_HEIGHT.
 * A realistic daily-expense distribution: some zero days, varied heights.
 */
const BAR_FRACTIONS = [
  0.3, 0.55, 0.0, 0.8, 0.45, 0.2, 0.65, 0.0, 0.5, 0.85, 0.35, 0.6, 0.0, 0.25,
  0.7, 0.5, 0.0, 0.4, 0.9, 0.55, 0.3, 0.75, 0.0, 0.5, 0.6, 0.35, 0.8, 0.45, 0.0,
  0.7,
];

export function InsightsCashflowChartSkeleton() {
  return (
    <View style={styles.cashflowSkel}>
      <View style={styles.cashflowChartRow}>
        {/* Y-axis tick labels */}
        <View style={[styles.yAxisSkel, { height: CHART_PLOT_HEIGHT }]}>
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
          <SkeletonBlock tone="surface" style={styles.yTickSkel} />
        </View>

        {/* Individual vertical bars — mimics accent-bar chart */}
        <View style={styles.cashflowBarsArea}>
          {BAR_FRACTIONS.map((frac, i) => (
            <View key={i} style={styles.cashflowBarCol}>
              {frac > 0 && (
                <SkeletonBlock
                  tone="surface"
                  style={[
                    styles.cashflowBarItem,
                    { height: Math.round(frac * CHART_PLOT_HEIGHT) },
                  ]}
                />
              )}
            </View>
          ))}
        </View>
      </View>

      {/* X-axis date labels */}
      <View style={styles.xLabelsSkel}>
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonBlock key={i} tone="surface" style={styles.xTickSkel} />
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legendSkel}>
        <SkeletonBlock tone="surface" style={styles.legendItemSkel} />
        <SkeletonBlock tone="surface" style={styles.legendItemSkel} />
      </View>
    </View>
  );
}

export function InsightsTopExpensesSkeleton() {
  return <TransactionRowListSkeleton />;
}

export function InsightsDonutCardSkeleton() {
  return (
    <View style={styles.donutSkeletonWrap}>
      {/* Row: donut circle | legend list — matches real donutLegendCluster */}
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
  // ── Donut skeleton ───────────────────────────────────────────────────────
  donutSkeletonWrap: {
    width: "100%",
    minHeight: CONTENT_MIN_HEIGHT - spacing.md - spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  donutContentSkel: {
    // Matches the real donutLegendCluster: row, gap, bounded width
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    // Do NOT set a fixed total width — let legend flex to prevent overflow
    maxWidth: "100%",
  },
  donutRingSkel: {
    borderRadius: DONUT_SIZE / 2,
    flexShrink: 0,
  },
  legendColSkel: {
    // flex: 1 lets the legend shrink on narrow screens (matches real `legend.flexShrink: 1`)
    flex: 1,
    maxWidth: PAYEE_DONUT_LEGEND_MAX_WIDTH,
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
    flexShrink: 0,
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

  // ── Cashflow chart skeleton ───────────────────────────────────────────────
  cashflowSkel: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  cashflowChartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  yAxisSkel: {
    width: Y_AXIS_GUTTER,
    justifyContent: "space-between",
    paddingTop: 10,
    paddingBottom: 4,
    paddingRight: 4,
    alignSelf: "stretch",
    alignItems: "flex-end",
  },
  yTickSkel: {
    width: 32,
    height: 8,
    borderRadius: radius.sm,
  },
  // Container for the bar columns — fills remaining width, anchors bars at bottom
  cashflowBarsArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    height: CHART_PLOT_HEIGHT,
    paddingHorizontal: 2,
  },
  cashflowBarCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 1,
  },
  cashflowBarItem: {
    width: "100%",
    borderRadius: radius.xs,
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
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  legendItemSkel: {
    width: 72,
    height: 10,
    borderRadius: radius.sm,
  },
});
