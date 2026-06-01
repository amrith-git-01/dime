import { BudgetLimitsEditor } from "@/features/budgets/components";

import { useEditMonthlyBudgetScreenModel } from "./useEditMonthlyBudgetScreenModel";

export default function EditMonthlyBudgetScreen() {
  const model = useEditMonthlyBudgetScreenModel();

  return (
    <BudgetLimitsEditor
      isEditMode={model.isEditMode}
      dailyDisplayAmount={model.dailyControl.displayAmount}
      monthlyDisplayAmount={model.monthlyControl.displayAmount}
      dailyIsCustom={model.dailyControl.isCustom}
      monthlyIsCustom={model.monthlyControl.isCustom}
      dailyValue={model.dailyControl.valueText}
      monthlyValue={model.monthlyControl.valueText}
      dailyStepIndex={model.dailyControl.stepIndex}
      monthlyStepIndex={model.monthlyControl.stepIndex}
      onDailyChange={model.dailyControl.onChangeText}
      onMonthlyChange={model.monthlyControl.onChangeText}
      onDailyStepChange={model.dailyControl.selectStep}
      onMonthlyStepChange={model.monthlyControl.selectStep}
      onSave={model.handleSave}
      onClear={model.handleClear}
      saveDisabled={model.saveDisabled}
      saveLoading={model.saveLoading}
    />
  );
}
