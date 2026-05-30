import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";
import { Keyboard, StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BudgetLimitsEditor } from "@/components/budget/bento/BudgetLimitsEditor";
import {
  DAILY_BUDGET_PRESETS,
  MONTHLY_BUDGET_PRESETS,
  resolveBudgetAmountForSave,
} from "@/components/budget/bento/budgetEditorPresets";
import { useBudgetLimitStepControl } from "@/components/budget/bento/useBudgetLimitStepControl";
import { colors, spacing } from "@/constants/theme";
import type { UpsertBudgetInput } from "@/features/budgets/api/budgetsApi";
import {
  useBudgetQuery,
  useUpsertBudgetMutation,
} from "@/features/budgets/hooks/useBudget";
import { useToast } from "@/features/toast/useToast";
import type { MainStackParamList } from "@/navigation/types";

type EditRoute = RouteProp<MainStackParamList, "EditMonthlyBudget">;
type StackNav = NativeStackNavigationProp<MainStackParamList>;

function amountsClose(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0001;
}

export default function EditMonthlyBudgetScreen() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<EditRoute>();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const upsertBudgetMutation = useUpsertBudgetMutation();

  const existingMonthly = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const existingDaily = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.daily_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingMonthly) && existingMonthly > 0;
  const hasDailyBudget = Number.isFinite(existingDaily) && existingDaily > 0;
  const hasAnyBudget = hasMonthlyBudget || hasDailyBudget;
  const isEditMode = route.params?.mode === "edit" || hasAnyBudget;

  const dailyControl = useBudgetLimitStepControl(
    DAILY_BUDGET_PRESETS,
    existingDaily,
    hasDailyBudget,
  );
  const monthlyControl = useBudgetLimitStepControl(
    MONTHLY_BUDGET_PRESETS,
    existingMonthly,
    hasMonthlyBudget,
  );

  const savePatch = useMemo((): UpsertBudgetInput => {
    const patch: UpsertBudgetInput = {};
    const parsedMonthly = resolveBudgetAmountForSave(
      monthlyControl.stepIndex,
      monthlyControl.valueText,
    );
    const parsedDaily = resolveBudgetAmountForSave(
      dailyControl.stepIndex,
      dailyControl.valueText,
    );

    if (
      parsedMonthly !== null &&
      (!hasMonthlyBudget || !amountsClose(parsedMonthly, existingMonthly))
    ) {
      patch.monthlyAmount = parsedMonthly;
    }
    if (
      parsedDaily !== null &&
      (!hasDailyBudget || !amountsClose(parsedDaily, existingDaily))
    ) {
      patch.dailyAmount = parsedDaily;
    }
    return patch;
  }, [
    dailyControl.stepIndex,
    dailyControl.valueText,
    existingDaily,
    existingMonthly,
    hasDailyBudget,
    hasMonthlyBudget,
    monthlyControl.stepIndex,
    monthlyControl.valueText,
  ]);

  const canSave = !isBudgetLoading && Object.keys(savePatch).length > 0;

  const handleSave = useCallback(() => {
    if (Object.keys(savePatch).length === 0) {
      navigation.goBack();
      return;
    }

    upsertBudgetMutation.mutate(savePatch, {
      onSuccess: () => {
        showToast({ variant: "success", message: "Budget saved" });
        navigation.goBack();
      },
    });
  }, [navigation, savePatch, showToast, upsertBudgetMutation]);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleClear = useCallback(() => {
    Keyboard.dismiss();
    dailyControl.resetToUnset();
    monthlyControl.resetToUnset();
  }, [dailyControl.resetToUnset, monthlyControl.resetToUnset]);

  return (
    <KeyboardAwareScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingBottom: spacing.xl + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <BudgetLimitsEditor
        isEditMode={isEditMode}
        dailyDisplayAmount={dailyControl.displayAmount}
        monthlyDisplayAmount={monthlyControl.displayAmount}
        dailyIsCustom={dailyControl.isCustom}
        monthlyIsCustom={monthlyControl.isCustom}
        dailyValue={dailyControl.valueText}
        monthlyValue={monthlyControl.valueText}
        dailyStepIndex={dailyControl.stepIndex}
        monthlyStepIndex={monthlyControl.stepIndex}
        onDailyChange={dailyControl.onChangeText}
        onMonthlyChange={monthlyControl.onChangeText}
        onDailyStepChange={dailyControl.selectStep}
        onMonthlyStepChange={monthlyControl.selectStep}
        onSave={handleSave}
        onClear={handleClear}
        onCancel={handleCancel}
        saveDisabled={!canSave || upsertBudgetMutation.isPending}
        saveLoading={upsertBudgetMutation.isPending}
      />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
