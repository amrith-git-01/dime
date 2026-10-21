import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";

import {
  CategorySpendBentoRow,
  type CategorySpendRowData,
} from "@/components/categories/CategorySpendBentoRow";
import {
  CATEGORY_SPEND_ROW_DIVIDER_INSET,
  OptionalTourTarget,
  SurfaceCardSegment,
} from "@/components/shared";
import { spacing } from "@/constants";
import type { TourTargetId } from "@/constants/tourTargetIds";
import { createThemedStyles } from "@/theme";

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
  /** Makes the row a guided-tour target (the first category, which the tour asks to open). */
  tourTargetId?: TourTargetId;
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
  tourTargetId,
}: BudgetCategoryRowProps) {
  const styles = useStyles();
  const handlePress = useCallback(() => onOpen(item), [onOpen, item]);
  const handleEditPress = useCallback(() => onEdit(item.id), [onEdit, item.id]);

  return (
    <SurfaceCardSegment
      isFirst={isFirst}
      isLast={isLast}
      marginHorizontal={spacing.lg}
      paddingHorizontal={spacing.lg}
    >
      <OptionalTourTarget id={tourTargetId}>
        <CategorySpendBentoRow
          item={item}
          hasMonthlyBudget={hasMonthlyBudget}
          monthlyBudgetAmount={monthlyBudgetAmount}
          onPress={handlePress}
          onEditPress={editable ? handleEditPress : undefined}
        />
      </OptionalTourTarget>
      {isLast ? null : <View style={styles.rowDivider} />}
    </SurfaceCardSegment>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: CATEGORY_SPEND_ROW_DIVIDER_INSET,
  },
}));
