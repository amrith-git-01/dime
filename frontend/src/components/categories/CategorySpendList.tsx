import { Fragment, memo } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/constants";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "./CategorySpendBentoRow";

export type CategorySpendListProps = {
  items: CategorySpendRowData[];
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  onCategoryPress?: (item: CategorySpendRowData) => void;
};

/**
 * Vertical category spend rows with Budget-screen spacing (used on Home; Budget uses FlashList).
 */
export const CategorySpendList = memo(function CategorySpendList({
  items,
  hasMonthlyBudget,
  monthlyBudgetAmount,
  onCategoryPress,
}: CategorySpendListProps) {
  return (
    <View>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <CategorySpendBentoRow
            item={item}
            hasMonthlyBudget={hasMonthlyBudget}
            monthlyBudgetAmount={monthlyBudgetAmount}
            onPress={onCategoryPress ? () => onCategoryPress(item) : undefined}
          />
        </Fragment>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  separator: {
    height: spacing.md,
  },
});
