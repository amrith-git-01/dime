import { StyleSheet, View } from "react-native";

import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { radius, spacing } from "@/constants/theme";

import { BUDGET_ROW_HEIGHT_WITH_PROGRESS } from "./budgetBentoTokens";

const DEFAULT_ROW_COUNT = 10;

type BudgetCategoryRowsSkeletonProps = {
  rowCount?: number;
};

/** Shape-matched skeleton rows for the Budget category list. */
export function BudgetCategoryRowsSkeleton({
  rowCount = DEFAULT_ROW_COUNT,
}: BudgetCategoryRowsSkeletonProps) {
  return (
    <View style={styles.root}>
      {Array.from({ length: rowCount }, (_, index) => (
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
    paddingTop: spacing.xs,
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
