import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BentoEditorFooter } from "@/components/bento";
import {
  inkSoft,
  spacing,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { BudgetAmountStepSlider } from "./BudgetAmountStepSlider";
import {
  BUDGET_CUSTOM_STEP_INDEX,
  DAILY_BUDGET_PRESETS,
  MONTHLY_BUDGET_PRESETS,
} from "./budgetEditorPresets";
import { BudgetLimitsBentoRow } from "./BudgetLimitsBentoRow";
import { focusBudgetAmountInput } from "./focusBudgetAmountInput";

type BudgetLimitsEditorProps = {
  isEditMode: boolean;
  dailyDisplayAmount: string;
  monthlyDisplayAmount: string;
  dailyIsCustom: boolean;
  monthlyIsCustom: boolean;
  dailyValue: string;
  monthlyValue: string;
  dailyStepIndex: number;
  monthlyStepIndex: number;
  onDailyChange: (text: string) => void;
  onMonthlyChange: (text: string) => void;
  onDailyStepChange: (index: number) => void;
  onMonthlyStepChange: (index: number) => void;
  onSave: () => void;
  onClear: () => void;
  saveDisabled: boolean;
  saveLoading: boolean;
};

export const BudgetLimitsEditor = memo(function BudgetLimitsEditor({
  isEditMode,
  dailyDisplayAmount,
  monthlyDisplayAmount,
  dailyIsCustom,
  monthlyIsCustom,
  dailyValue,
  monthlyValue,
  dailyStepIndex,
  monthlyStepIndex,
  onDailyChange,
  onMonthlyChange,
  onDailyStepChange,
  onMonthlyStepChange,
  onSave,
  onClear,
  saveDisabled,
  saveLoading,
}: BudgetLimitsEditorProps) {
  const dailyInputRef = useRef<TextInput>(null);
  const monthlyInputRef = useRef<TextInput>(null);
  const pendingDailyFocusRef = useRef(false);
  const pendingMonthlyFocusRef = useRef(false);
  const [dailyFocusGeneration, setDailyFocusGeneration] = useState(0);
  const [monthlyFocusGeneration, setMonthlyFocusGeneration] = useState(0);

  const queueDailyFocus = useCallback(() => {
    pendingDailyFocusRef.current = true;
    setDailyFocusGeneration((generation) => generation + 1);
  }, []);

  const queueMonthlyFocus = useCallback(() => {
    pendingMonthlyFocusRef.current = true;
    setMonthlyFocusGeneration((generation) => generation + 1);
  }, []);

  useLayoutEffect(() => {
    if (!pendingDailyFocusRef.current || !dailyIsCustom) {
      return;
    }
    pendingDailyFocusRef.current = false;
    focusBudgetAmountInput(dailyInputRef.current);
  }, [dailyIsCustom, dailyStepIndex, dailyFocusGeneration]);

  useLayoutEffect(() => {
    if (!pendingMonthlyFocusRef.current || !monthlyIsCustom) {
      return;
    }
    pendingMonthlyFocusRef.current = false;
    focusBudgetAmountInput(monthlyInputRef.current);
  }, [monthlyIsCustom, monthlyStepIndex, monthlyFocusGeneration]);

  const handleDailyStepChange = useCallback(
    (index: number) => {
      if (index === BUDGET_CUSTOM_STEP_INDEX) {
        queueDailyFocus();
      }
      onDailyStepChange(index);
    },
    [onDailyStepChange, queueDailyFocus],
  );

  const handleMonthlyStepChange = useCallback(
    (index: number) => {
      if (index === BUDGET_CUSTOM_STEP_INDEX) {
        queueMonthlyFocus();
      }
      onMonthlyStepChange(index);
    },
    [onMonthlyStepChange, queueMonthlyFocus],
  );

  const handleDailyTilePress = useCallback(() => {
    if (!dailyIsCustom) {
      return;
    }
    focusBudgetAmountInput(dailyInputRef.current);
  }, [dailyIsCustom]);

  const handleMonthlyTilePress = useCallback(() => {
    if (!monthlyIsCustom) {
      return;
    }
    focusBudgetAmountInput(monthlyInputRef.current);
  }, [monthlyIsCustom]);

  const handleClear = useCallback(() => {
    pendingDailyFocusRef.current = false;
    pendingMonthlyFocusRef.current = false;
    onClear();
  }, [onClear]);

  const saveTitle = isEditMode ? "Update" : "Save";

  return (
    <View style={styles.content}>
      <Text style={styles.description}>
        Slide to a preset or choose Custom. Daily and monthly caps stay
        independent.
      </Text>

      {/* Cap tiles */}
      <BudgetLimitsBentoRow
        dailyInputRef={dailyInputRef}
        monthlyInputRef={monthlyInputRef}
        dailyDisplayAmount={dailyDisplayAmount}
        monthlyDisplayAmount={monthlyDisplayAmount}
        dailyIsCustom={dailyIsCustom}
        monthlyIsCustom={monthlyIsCustom}
        dailyValue={dailyValue}
        monthlyValue={monthlyValue}
        onDailyChange={onDailyChange}
        onMonthlyChange={onMonthlyChange}
        onDailyAmountPress={handleDailyTilePress}
        onMonthlyAmountPress={handleMonthlyTilePress}
        onSubmitEditing={onSave}
      />

      {/* Sliders */}
      <View style={styles.slidersBlock}>
        <BudgetAmountStepSlider
          label="Daily cap"
          presets={DAILY_BUDGET_PRESETS}
          stepIndex={dailyStepIndex}
          onStepChange={handleDailyStepChange}
        />
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

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  description: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: inkSoft,
  },
  slidersBlock: {
    gap: spacing.xl,
  },
});
