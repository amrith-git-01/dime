import { StyleSheet, View } from "react-native";

import {
  CATEGORY_SPEND_ROW_DIVIDER_INSET,
  CategorySpendRowSkeleton,
} from "@/components/shared";

import { createThemedStyles } from "@/theme";

const DEFAULT_ROW_COUNT = 5;

type BudgetCategoryRowsSkeletonProps = {
  rowCount?: number;
  showProgress?: boolean;
};

/** Shape-matched skeleton rows for the Budget category list card. */
export function BudgetCategoryRowsSkeleton({
  rowCount = DEFAULT_ROW_COUNT,
  showProgress = true,
}: BudgetCategoryRowsSkeletonProps) {
  const styles = useStyles();
  return (
    <View>
      {Array.from({ length: rowCount }, (_, index) => (
        <View key={index}>
          {index > 0 && (
            <View
              style={[
                styles.divider,
                { marginLeft: CATEGORY_SPEND_ROW_DIVIDER_INSET },
              ]}
            />
          )}
          <CategorySpendRowSkeleton showProgress={showProgress} />
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
}));
