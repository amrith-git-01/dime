import { StyleSheet, View } from "react-native";

import {
  HOME_BENTO_SECTION_GAP,
  HOME_SECTION_CARD_PADDING,
} from "@/components/home/bento/homeBentoTokens";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { bento, radius, spacing } from "@/constants/theme";

import { BUDGET_ROW_HEIGHT_WITH_PROGRESS } from "./budgetBentoTokens";

/**
 * Shape-matched loading skeleton for Budget bento summary + category rows.
 */
export function BudgetBentoSkeleton() {
  return (
    <View style={styles.root}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeaderSkel}>
          <View style={styles.summaryHeaderLeftSkel}>
            <SkeletonBlock tone="surface" style={styles.kickerSkel} />
            <SkeletonBlock tone="surface" style={styles.statusSkel} />
          </View>
          <SkeletonBlock tone="surface" style={styles.dropdownSkel} />
        </View>
        <View style={styles.summaryBodySkel}>
          <SkeletonBlock tone="surface" style={styles.bodyKickerSkel} />
          <View style={styles.statsSkel}>
            <SkeletonBlock tone="surface" style={styles.statSkel} />
            <SkeletonBlock tone="surface" style={styles.statSkel} />
            <SkeletonBlock tone="surface" style={styles.statSkel} />
          </View>
          <SkeletonBlock tone="surface" style={styles.progressSkel} />
        </View>
      </View>

      <View style={styles.sectionHeaderSkel}>
        <SkeletonBlock tone="surface" style={styles.sectionTitleSkel} />
        <SkeletonBlock tone="surface" style={styles.addSkel} />
      </View>

      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          style={[styles.rowSkel, index > 0 && styles.rowSkelGap]}
        >
          <SkeletonBlock tone="surface" style={styles.rowIconSkel} />
          <View style={styles.rowTextSkel}>
            <SkeletonBlock tone="surface" style={styles.rowTitleSkel} />
            <SkeletonBlock tone="surface" style={styles.rowSubSkel} />
          </View>
          <SkeletonBlock tone="surface" style={styles.rowAmountSkel} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: HOME_BENTO_SECTION_GAP,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  summaryCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  summaryHeaderSkel: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: bento.twoToneHeaderSurface,
    padding: HOME_SECTION_CARD_PADDING,
    paddingBottom: spacing.md,
  },
  summaryHeaderLeftSkel: {
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
  summaryBodySkel: {
    padding: HOME_SECTION_CARD_PADDING,
    paddingTop: spacing.md,
    backgroundColor: bento.twoToneBodySurface,
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
  sectionHeaderSkel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  sectionTitleSkel: {
    width: 100,
    height: 14,
    borderRadius: radius.sm,
  },
  addSkel: {
    width: 48,
    height: 14,
    borderRadius: radius.sm,
  },
  rowSkel: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: BUDGET_ROW_HEIGHT_WITH_PROGRESS,
    gap: spacing.md,
  },
  rowSkelGap: {
    marginTop: spacing.md,
  },
  rowIconSkel: {
    width: 46,
    height: 46,
    borderRadius: 12,
  },
  rowTextSkel: {
    flex: 1,
    gap: 6,
  },
  rowTitleSkel: {
    width: "55%",
    height: 14,
    borderRadius: radius.sm,
  },
  rowSubSkel: {
    width: "40%",
    height: 11,
    borderRadius: radius.sm,
  },
  rowAmountSkel: {
    width: 56,
    height: 14,
    borderRadius: radius.sm,
  },
});
