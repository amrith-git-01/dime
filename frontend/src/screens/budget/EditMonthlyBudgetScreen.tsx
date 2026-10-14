import { BudgetLimitsEditor } from "@/features/budgets/components";

import { useEditMonthlyBudgetScreenModel } from "./useEditMonthlyBudgetScreenModel";

export default function EditMonthlyBudgetScreen() {
  const model = useEditMonthlyBudgetScreenModel();

  return (
    <BudgetLimitsEditor
      isEditMode={model.isEditMode}
      monthlyDisplayAmount={model.monthlyControl.displayAmount}
      monthlyIsCustom={model.monthlyControl.isCustom}
      monthlyValue={model.monthlyControl.valueText}
      monthlyStepIndex={model.monthlyControl.stepIndex}
      onMonthlyChange={model.monthlyControl.onChangeText}
      onMonthlyStepChange={model.monthlyControl.selectStep}
      onSave={model.handleSave}
      onClear={model.handleClear}
      saveDisabled={model.saveDisabled}
      saveLoading={model.saveLoading}
    />
  );
}
