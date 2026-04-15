import { StyleSheet, View } from "react-native";

import { SkeletonListRow } from "@/components/shared";
import { spacing } from "@/constants";

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
          style={index > 0 && styles.rowSkelGap}
        >
          <SkeletonListRow
            minHeight={BUDGET_ROW_HEIGHT_WITH_PROGRESS}
            iconSize={46}
            iconRadius={12}
            gap={spacing.md}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: spacing.xs,
  },
  rowSkelGap: {
    marginTop: spacing.md,
  },
});
