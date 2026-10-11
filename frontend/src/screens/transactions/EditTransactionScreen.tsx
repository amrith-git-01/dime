import { ManualAddTransactionEditor } from "@/features/transactions/components";

import { useEditTransactionScreenModel } from "./useEditTransactionScreenModel";

export default function EditTransactionScreen() {
  const model = useEditTransactionScreenModel();

  return (
    <ManualAddTransactionEditor
      amountText={model.amountText}
      amountFocused={model.amountFocused}
      onAmountChange={model.setAmountText}
      onAmountFocus={() => model.setAmountFocused(true)}
      onAmountBlur={() => model.setAmountFocused(false)}
      txType={model.txType}
      onSetExpense={model.setExpenseType}
      onSetIncome={model.setIncomeType}
      counterpartyType={model.counterpartyType}
      onCounterpartyTypeChange={model.setCounterpartyType}
      counterpartyName={model.counterpartyName}
      onCounterpartyNameChange={model.setCounterpartyName}
      categoriesLoading={model.categoriesLoading}
      visibleCategories={model.visibleCategories}
      categoryId={model.categoryId}
      onCategoryPress={model.handleCategoryPress}
      onAddCategory={model.openCreateCustomCategory}
      addCategoryDisabled={model.addCategoryDisabled}
      note={model.note}
      onNoteChange={model.setNote}
      transactionAt={model.transactionAt}
      onDatePress={model.onDateRowPress}
      onTimePress={model.onTimeRowPress}
      iosPickerMode={model.iosPickerMode}
      onIosPickerChange={model.handleIosPickerChange}
      saveLoading={model.saveLoading}
      onSave={() => {
        void model.onSave();
      }}
      onClear={model.handleClear}
    />
  );
}

