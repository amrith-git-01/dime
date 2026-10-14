import { memo, type RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { BudgetLimitBentoTile } from "./BudgetLimitBentoTile";
import { BUDGET_EDITOR_ROW_MIN_HEIGHT } from "./budgetEditorBentoTokens";

type BudgetLimitsBentoRowProps = {
  monthlyInputRef: RefObject<TextInput | null>;
  monthlyDisplayAmount: string;
  monthlyIsCustom: boolean;
  monthlyValue: string;
  onMonthlyChange: (text: string) => void;
  onMonthlyAmountPress?: () => void;
  onSubmitEditing?: () => void;
};

export const BudgetLimitsBentoRow = memo(function BudgetLimitsBentoRow({
  monthlyInputRef,
  monthlyDisplayAmount,
  monthlyIsCustom,
  monthlyValue,
  onMonthlyChange,
  onMonthlyAmountPress,
  onSubmitEditing,
}: BudgetLimitsBentoRowProps) {
  return (
    <View style={styles.row}>
      <BudgetLimitBentoTile
        ref={monthlyInputRef}
        displayAmount={monthlyDisplayAmount}
        isCustom={monthlyIsCustom}
        value={monthlyValue}
        onChangeText={onMonthlyChange}
        onAmountPress={onMonthlyAmountPress}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: BUDGET_EDITOR_ROW_MIN_HEIGHT,
  },
});
