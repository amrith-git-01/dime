import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "@/components/categories/CategorySpendBentoRow";
import {
  CATEGORY_SPEND_ROW_DIVIDER_INSET,
  SurfaceCardSegment,
} from "@/components/shared";
import { line, spacing } from "@/constants";

export type BudgetCategoryRowProps = {
  item: CategorySpendRowData;
  isFirst: boolean;
  isLast: boolean;
  /** Whether the category tile offers an edit shortcut (not for "uncategorized"). */
  editable: boolean;
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  onOpen: (item: CategorySpendRowData) => void;
  onEdit: (categoryId: string) => void;
};

/** One category row of the Budget list, drawn as a slice of the shared white card. */
export const BudgetCategoryRow = memo(function BudgetCategoryRow({
  item,
  isFirst,
  isLast,
  editable,
  hasMonthlyBudget,
  monthlyBudgetAmount,
  onOpen,
  onEdit,
}: BudgetCategoryRowProps) {
  const handlePress = useCallback(() => onOpen(item), [onOpen, item]);
  const handleEditPress = useCallback(() => onEdit(item.id), [onEdit, item.id]);

  return (
    <SurfaceCardSegment
      isFirst={isFirst}
      isLast={isLast}
      marginHorizontal={spacing.lg}
      paddingHorizontal={spacing.lg}
    >
      <CategorySpendBentoRow
        item={item}
        hasMonthlyBudget={hasMonthlyBudget}
        monthlyBudgetAmount={monthlyBudgetAmount}
        onPress={handlePress}
        onEditPress={editable ? handleEditPress : undefined}
      />
      {isLast ? null : <View style={styles.rowDivider} />}
    </SurfaceCardSegment>
  );
});

const styles = StyleSheet.create({
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginLeft: CATEGORY_SPEND_ROW_DIVIDER_INSET,
  },
});
