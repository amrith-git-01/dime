import { memo } from "react";
import { View } from "react-native";

import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles } from "@/theme";

/** The hero card while the forecast loads: kicker, the big number, the band and a line of text. */
export const ForecastHeroSkeleton = memo(function ForecastHeroSkeleton() {
  const styles = useStyles();
  return (
    <InsightsCard
      kicker="MONTH FORECAST"
      subtitle="Where this month is likely to end"
    >
      <View style={styles.body}>
        <SkeletonBlock style={styles.headline} />
        <SkeletonBlock style={styles.big} />
        <SkeletonBlock style={styles.band} />
        <SkeletonBlock style={styles.line} />
      </View>
    </InsightsCard>
  );
});

/** Safe to spend while it loads. */
export const SafeToSpendSkeleton = memo(function SafeToSpendSkeleton() {
  const styles = useStyles();
  return (
    <InsightsCard kicker="SAFE TO SPEND TODAY">
      <View style={styles.body}>
        <SkeletonBlock style={styles.big} />
        <SkeletonBlock style={styles.line} />
      </View>
    </InsightsCard>
  );
});

/** Coming up while it loads: a few rows of icon, name and amount. */
export const ComingUpSkeleton = memo(function ComingUpSkeleton() {
  const styles = useStyles();
  return (
    <InsightsCard kicker="COMING UP" subtitle="The next 14 days">
      <View style={styles.rows}>
        {[0, 1, 2].map((n) => (
          <View key={n} style={styles.row}>
            <SkeletonBlock style={styles.tile} />
            <View style={styles.rowText}>
              <SkeletonBlock style={styles.rowName} />
              <SkeletonBlock style={styles.rowSub} />
            </View>
            <SkeletonBlock style={styles.rowAmount} />
          </View>
        ))}
      </View>
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(() => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  headline: {
    width: "55%",
    height: 14,
    borderRadius: radius.sm,
  },
  big: {
    width: "45%",
    height: 34,
    borderRadius: radius.sm,
  },
  band: {
    width: "100%",
    height: 10,
    borderRadius: radius.full,
  },
  line: {
    width: "75%",
    height: 14,
    borderRadius: radius.sm,
  },
  rows: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  rowText: {
    flex: 1,
    gap: 6,
  },
  rowName: {
    width: "55%",
    height: 14,
    borderRadius: radius.sm,
  },
  rowSub: {
    width: "30%",
    height: 10,
    borderRadius: radius.sm,
  },
  rowAmount: {
    width: 56,
    height: 16,
    borderRadius: radius.sm,
  },
}));
