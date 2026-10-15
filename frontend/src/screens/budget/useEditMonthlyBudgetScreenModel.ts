import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";
import { Keyboard } from "react-native";

import {
  MONTHLY_BUDGET_PRESETS,
  resolveBudgetAmountForSave,
  useBudgetLimitStepControl,
} from "@/features/budgets/components";
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

export function useEditMonthlyBudgetScreenModel() {
  const navigation = useNavigation<StackNav>();
  const route = useRoute<EditRoute>();
  const { showToast } = useToast();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const upsertBudgetMutation = useUpsertBudgetMutation();

  const existingMonthly = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingMonthly) && existingMonthly > 0;
  const isEditMode = route.params?.mode === "edit" || hasMonthlyBudget;

  const monthlyControl = useBudgetLimitStepControl(
    MONTHLY_BUDGET_PRESETS,
    existingMonthly,
    hasMonthlyBudget,
  );
  const { resetToUnset: resetMonthlyBudget } = monthlyControl;

  const savePatch = useMemo((): UpsertBudgetInput => {
    const patch: UpsertBudgetInput = {};
    const parsedMonthly = resolveBudgetAmountForSave(
      monthlyControl.stepIndex,
      monthlyControl.valueText,
    );

    if (
      parsedMonthly !== null &&
      (!hasMonthlyBudget || !amountsClose(parsedMonthly, existingMonthly))
    ) {
      patch.monthlyAmount = parsedMonthly;
    }
    return patch;
  }, [
    existingMonthly,
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

  const handleClear = useCallback(() => {
    Keyboard.dismiss();
    resetMonthlyBudget();
  }, [resetMonthlyBudget]);

  return {
    isEditMode,
    monthlyControl,
    handleSave,
    handleClear,
    saveDisabled: !canSave || upsertBudgetMutation.isPending,
    saveLoading: upsertBudgetMutation.isPending,
  };
}
