import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonStrip } from "@/components/ui";
import { line, radius, spacing } from "@/constants";

/**
 * Body placeholder for BudgetSummaryCard while month + budget queries load.
 * Keeps the real month nav visible above this block.
 */
export function BudgetSummaryBodySkeleton() {
  return (
    <View style={styles.root}>
      <SkeletonBlock tone="surface" style={styles.kicker} />

      <SkeletonStrip variant="amountHero" style={styles.hero} />

      <SkeletonBlock tone="surface" style={styles.progress} />

      <SkeletonBlock tone="surface" style={styles.pill} />

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <SkeletonBlock tone="surface" style={styles.statLabel} />
          <SkeletonStrip variant="statValue" style={styles.statValue} />
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <SkeletonBlock tone="surface" style={styles.statLabel} />
          <SkeletonStrip variant="statValue" style={styles.statValue} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 0,
  },
  kicker: {
    width: 120,
    height: 12,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  hero: {
    width: "55%",
    height: 40,
    marginBottom: spacing.md,
  },
  progress: {
    width: "100%",
    height: 8,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  pill: {
    width: 96,
    height: 24,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
  },
  statLabel: {
    width: 48,
    height: 12,
    borderRadius: radius.sm,
  },
  statValue: {
    width: 60,
    height: 18,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: line,
    marginHorizontal: spacing.md,
  },
});
