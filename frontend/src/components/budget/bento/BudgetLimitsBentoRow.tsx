import { memo, type RefObject } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { BudgetLimitBentoTile } from "./BudgetLimitBentoTile";
import {
  BUDGET_EDITOR_ROW_GAP,
  BUDGET_EDITOR_ROW_MIN_HEIGHT,
} from "./budgetEditorBentoTokens";

type BudgetLimitsBentoRowProps = {
  dailyInputRef: RefObject<TextInput | null>;
  monthlyInputRef: RefObject<TextInput | null>;
  dailyDisplayAmount: string;
  monthlyDisplayAmount: string;
  dailyIsCustom: boolean;
  monthlyIsCustom: boolean;
  dailyValue: string;
  monthlyValue: string;
  onDailyChange: (text: string) => void;
  onMonthlyChange: (text: string) => void;
  onDailyAmountPress?: () => void;
  onMonthlyAmountPress?: () => void;
  onSubmitEditing?: () => void;
};

export const BudgetLimitsBentoRow = memo(function BudgetLimitsBentoRow({
  dailyInputRef,
  monthlyInputRef,
  dailyDisplayAmount,
  monthlyDisplayAmount,
  dailyIsCustom,
  monthlyIsCustom,
  dailyValue,
  monthlyValue,
  onDailyChange,
  onMonthlyChange,
  onDailyAmountPress,
  onMonthlyAmountPress,
  onSubmitEditing,
}: BudgetLimitsBentoRowProps) {
  return (
    <View style={styles.row}>
      <BudgetLimitBentoTile
        kind="daily"
        ref={dailyInputRef}
        displayAmount={dailyDisplayAmount}
        isCustom={dailyIsCustom}
        value={dailyValue}
        onChangeText={onDailyChange}
        onAmountPress={onDailyAmountPress}
        onSubmitEditing={onSubmitEditing}
      />
      <BudgetLimitBentoTile
        kind="monthly"
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
    flexDirection: "row",
    gap: BUDGET_EDITOR_ROW_GAP,
    minHeight: BUDGET_EDITOR_ROW_MIN_HEIGHT,
  },
});
