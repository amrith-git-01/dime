import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  Text,
  TextInput,
  View,
} from "react-native";

import { BentoEditorFooter } from "@/components/bento";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { BudgetAmountStepSlider } from "./BudgetAmountStepSlider";
import {
  BUDGET_CUSTOM_STEP_INDEX,
  MONTHLY_BUDGET_PRESETS,
} from "./budgetEditorPresets";
import { BudgetLimitsBentoRow } from "./BudgetLimitsBentoRow";
import { focusBudgetAmountInput } from "./focusBudgetAmountInput";
import { createThemedStyles } from "@/theme";

type BudgetLimitsEditorProps = {
  isEditMode: boolean;
  monthlyDisplayAmount: string;
  monthlyIsCustom: boolean;
  monthlyValue: string;
  monthlyStepIndex: number;
  onMonthlyChange: (text: string) => void;
  onMonthlyStepChange: (index: number) => void;
  onSave: () => void;
  onClear: () => void;
  saveDisabled: boolean;
  saveLoading: boolean;
};

export const BudgetLimitsEditor = memo(function BudgetLimitsEditor({
  isEditMode,
  monthlyDisplayAmount,
  monthlyIsCustom,
  monthlyValue,
  monthlyStepIndex,
  onMonthlyChange,
  onMonthlyStepChange,
  onSave,
  onClear,
  saveDisabled,
  saveLoading,
}: BudgetLimitsEditorProps) {
  const styles = useStyles();
  const monthlyInputRef = useRef<TextInput>(null);
  const pendingMonthlyFocusRef = useRef(false);
  const [monthlyFocusGeneration, setMonthlyFocusGeneration] = useState(0);

  const queueMonthlyFocus = useCallback(() => {
    pendingMonthlyFocusRef.current = true;
    setMonthlyFocusGeneration((generation) => generation + 1);
  }, []);

  useLayoutEffect(() => {
    if (!pendingMonthlyFocusRef.current || !monthlyIsCustom) {
      return;
    }
    pendingMonthlyFocusRef.current = false;
    focusBudgetAmountInput(monthlyInputRef.current);
  }, [monthlyIsCustom, monthlyStepIndex, monthlyFocusGeneration]);

  const handleMonthlyStepChange = useCallback(
    (index: number) => {
      if (index === BUDGET_CUSTOM_STEP_INDEX) {
        queueMonthlyFocus();
      }
      onMonthlyStepChange(index);
    },
    [onMonthlyStepChange, queueMonthlyFocus],
  );

  const handleMonthlyTilePress = useCallback(() => {
    if (!monthlyIsCustom) {
      return;
    }
    focusBudgetAmountInput(monthlyInputRef.current);
  }, [monthlyIsCustom]);

  const handleClear = useCallback(() => {
    pendingMonthlyFocusRef.current = false;
    onClear();
  }, [onClear]);

  const saveTitle = isEditMode ? "Update" : "Save";

  return (
    <View style={styles.content}>
      <Text style={styles.description}>
        Slide to a preset or choose Custom. Your monthly cap applies to every
        calendar month.
      </Text>

      {/* Cap tile */}
      <BudgetLimitsBentoRow
        monthlyInputRef={monthlyInputRef}
        monthlyDisplayAmount={monthlyDisplayAmount}
        monthlyIsCustom={monthlyIsCustom}
        monthlyValue={monthlyValue}
        onMonthlyChange={onMonthlyChange}
        onMonthlyAmountPress={handleMonthlyTilePress}
        onSubmitEditing={onSave}
      />

      {/* Slider */}
      <View style={styles.slidersBlock}>
        <BudgetAmountStepSlider
          label="Monthly cap"
          presets={MONTHLY_BUDGET_PRESETS}
          stepIndex={monthlyStepIndex}
          onStepChange={handleMonthlyStepChange}
        />
      </View>

      {/* Footer */}
      <BentoEditorFooter
        onClear={handleClear}
        onSave={onSave}
        saveTitle={saveTitle}
        saveLoading={saveLoading}
        saveDisabled={saveDisabled}
      />
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  content: {
    gap: spacing.xl,
  },
  description: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  slidersBlock: {
    gap: spacing.xl,
  },
}));
