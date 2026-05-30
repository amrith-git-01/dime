import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/ui/Button/Button";
import { colors, radius, spacing, typography } from "@/constants/theme";

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

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {isEditMode ? "Update budget limits" : "Budget limits"}
      </Text>
      <Text style={styles.description}>
        Slide to a preset or choose Custom. Daily and monthly caps stay
        independent.
      </Text>

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

      <View style={styles.actionsRow}>
        <View style={styles.actionButtonWrap}>
          <Button
            title={isEditMode ? "Update" : "Save"}
            loading={saveLoading}
            onPress={onSave}
            disabled={saveDisabled}
          />
        </View>
        <View style={styles.actionButtonWrap}>
          <Button title="Clear" variant="secondary" onPress={handleClear} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.barBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  title: {
    fontFamily: typography.headerUsernameLine.fontFamily,
    fontSize: 16,
    color: colors.textPrimary,
  },
  description: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontFamily: typography.screenSubtitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  slidersBlock: {
    marginTop: spacing.lg,
    gap: spacing.xl,
  },
  actionsRow: {
    marginTop: spacing.lg,
    flexDirection: "row",
    gap: spacing.md,
  },
  actionButtonWrap: {
    flex: 1,
  },
});
