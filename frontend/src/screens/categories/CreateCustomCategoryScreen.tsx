import { CustomCategoryEditor } from "@/features/categories/components";

import { useCreateCustomCategoryScreenModel } from "./useCreateCustomCategoryScreenModel";

export default function CreateCustomCategoryScreen() {
  const model = useCreateCustomCategoryScreenModel();

  return (
    <CustomCategoryEditor
      name={model.name}
      iconName={model.iconName}
      color={model.color}
      monthlyBudget={model.monthlyBudget}
      atLimit={model.atLimit}
      saveDisabled={false}
      saveLoading={model.saveLoading}
      limitHint={model.limitHint}
      onNameChange={model.onNameChange}
      onIconChange={model.onIconChange}
      onColorChange={model.onColorChange}
      onMonthlyBudgetChange={model.onMonthlyBudgetChange}
      onClear={model.onClear}
      onSave={model.onSave}
    />
  );
}
