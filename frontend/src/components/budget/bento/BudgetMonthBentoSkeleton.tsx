import { StyleSheet, View } from "react-native";

import { HOME_SECTION_CARD_PADDING } from "@/components/home/bento/homeBentoTokens";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { bento, radius, spacing } from "@/constants/theme";

/** Shape-matched skeleton for the Budget month summary bento card. */
export function BudgetMonthBentoSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.headerSection}>
        <BudgetMonthHeaderSkeleton />
      </View>
      <View style={styles.bodySection}>
        <BudgetMonthBodySkeleton />
      </View>
    </View>
  );
}

export function BudgetMonthHeaderSkeleton() {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        <SkeletonBlock tone="surface" style={styles.kickerSkel} />
        <SkeletonBlock tone="surface" style={styles.statusSkel} />
      </View>
      <SkeletonBlock tone="surface" style={styles.dropdownSkel} />
    </View>
  );
}

export function BudgetMonthBodySkeleton() {
  return (
    <View style={styles.bodySkel}>
      <SkeletonBlock tone="surface" style={styles.bodyKickerSkel} />
      <View style={styles.statsSkel}>
        <SkeletonBlock tone="surface" style={styles.statSkel} />
        <SkeletonBlock tone="surface" style={styles.statSkel} />
        <SkeletonBlock tone="surface" style={styles.statSkel} />
      </View>
      <SkeletonBlock tone="surface" style={styles.progressSkel} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  headerSection: {
    backgroundColor: bento.twoToneHeaderSurface,
    padding: HOME_SECTION_CARD_PADDING,
    paddingBottom: spacing.md,
  },
  bodySection: {
    backgroundColor: bento.twoToneBodySurface,
    padding: HOME_SECTION_CARD_PADDING,
    paddingTop: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    gap: 6,
  },
  kickerSkel: {
    width: 72,
    height: 10,
    borderRadius: radius.sm,
  },
  statusSkel: {
    width: "50%",
    height: 22,
    borderRadius: radius.sm,
  },
  dropdownSkel: {
    width: 120,
    height: 28,
    borderRadius: radius.sm,
  },
  bodySkel: {
    gap: spacing.sm,
  },
  bodyKickerSkel: {
    width: 56,
    height: 10,
    borderRadius: radius.sm,
  },
  statsSkel: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statSkel: {
    flex: 1,
    height: 36,
    borderRadius: radius.sm,
  },
  progressSkel: {
    width: "100%",
    height: 8,
    borderRadius: radius.full,
    marginTop: spacing.xs,
  },
});
