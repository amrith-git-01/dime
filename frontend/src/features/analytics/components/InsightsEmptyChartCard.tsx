import { memo } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import { createThemedStyles } from "@/theme";

import { InsightsCard } from "./InsightsCard";

/** Relative bar heights (0-1) of the sample chart: a plausible month, nothing the user could mistake for their data. */
const SAMPLE_BARS = [0.35, 0.6, 0.2, 0.8, 0.5, 0.3, 0.95, 0.45, 0.25, 0.7, 0.4, 0.55] as const;
/** Bars drawn in the accent colour (the rest are tinted), to hint at a few "big" days. */
const HIGHLIGHTED_BARS: ReadonlySet<number> = new Set([3, 6, 9]);

const CHART_HEIGHT = 96;

export type InsightsEmptyChartCardProps = {
  onAddExpense: () => void;
};

/**
 * Insights for a month with no transactions: a ghosted sample chart with the promise of what comes,
 * instead of empty cards. The sample is decoration only: faded, not interactive, hidden from screen readers.
 */
export const InsightsEmptyChartCard = memo(function InsightsEmptyChartCard({
  onAddExpense,
}: InsightsEmptyChartCardProps) {
  const styles = useStyles();
  return (
    <InsightsCard kicker="Your month at a glance">
      <View style={styles.body}>
        <View
          style={styles.ghost}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {SAMPLE_BARS.map((height, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                { height: CHART_HEIGHT * height },
                HIGHLIGHTED_BARS.has(index) && styles.barHighlight,
              ]}
            />
          ))}
        </View>
        <Text style={styles.label}>Your chart appears after a few expenses</Text>
        <Button
          title="Add expense"
          size="compact"
          onPress={onAddExpense}
          accessibilityLabel="Add expense"
        />
      </View>
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  ghost: {
    alignSelf: "stretch",
    height: CHART_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.xs,
    opacity: 0.35,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  bar: {
    flex: 1,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    backgroundColor: colors.accentTint,
  },
  barHighlight: {
    backgroundColor: colors.accent,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    textAlign: "center",
  },
}));
