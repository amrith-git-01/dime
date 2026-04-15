import { StyleSheet, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";

import { BudgetCategoryRowsSkeleton } from "./BudgetCategoryRowsSkeleton";
import { BudgetMonthBentoSkeleton } from "./BudgetMonthBentoSkeleton";

/**
 * Full Budget tab loading skeleton (summary card + categories section).
 */
export function BudgetBentoSkeleton() {
  return (
    <View style={styles.root}>
      <BudgetMonthBentoSkeleton />

      <View style={styles.sectionHeaderSkel}>
        <SkeletonBlock tone="surface" style={styles.sectionTitleSkel} />
        <SkeletonBlock tone="surface" style={styles.addSkel} />
      </View>

      <BudgetCategoryRowsSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: BENTO_SECTION_GAP,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionHeaderSkel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
});
