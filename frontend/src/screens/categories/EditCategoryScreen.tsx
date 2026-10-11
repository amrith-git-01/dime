import {
  CustomCategoryEditor,
  DeleteCategorySheet,
} from "@/features/categories/components";

import { useEditCategoryScreenModel } from "./useEditCategoryScreenModel";

export default function EditCategoryScreen() {
  const model = useEditCategoryScreenModel();
  const { category } = model;

  if (!category) {
    return null;
  }

  return (
    <>
      <CustomCategoryEditor
        name={model.name}
        iconName={model.iconName}
        color={model.color}
        monthlyBudget={model.monthlyBudget}
        atLimit={false}
        saveDisabled={false}
        saveLoading={model.saveLoading}
        fieldsDisabled={model.fieldsDisabled}
        onDelete={model.fieldsDisabled ? undefined : model.onDeletePress}
        deleteLoading={model.deleteLoading}
        onNameChange={model.onNameChange}
        onIconChange={model.onIconChange}
        onColorChange={model.onColorChange}
        onMonthlyBudgetChange={model.onMonthlyBudgetChange}
        onClear={model.onClear}
        onSave={model.onSave}
      />
      <DeleteCategorySheet
        visible={model.deleteSheetVisible}
        category={category}
        categories={model.categories ?? []}
        onClose={model.onCloseDeleteSheet}
        onConfirmDelete={model.onConfirmDelete}
        deleteLoading={model.deleteLoading}
      />
    </>
  );
}
