import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
  BentoEditorFooter,
} from "@/components/bento";
import { TwoToneCard } from "@/components/shared";
import { SelectDropdown, TextField } from "@/components/ui";
import { colors } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { CategoryRow } from "@/features/categories/types";
import {
  COUNTERPARTY_TYPE_OPTIONS,
  type CounterpartyType,
} from "@/features/transactions/counterpartyTypes";
import type { TransactionType } from "@/features/transactions/types";

import { ManualAddAmountSection } from "./ManualAddAmountSection";
import { ManualAddCategorySection } from "./ManualAddCategorySection";
import { ManualAddDateField } from "./ManualAddDateField";

export type ManualAddTransactionEditorProps = {
  amountText: string;
  amountFocused: boolean;
  onAmountChange: (text: string) => void;
  onAmountFocus: () => void;
  onAmountBlur: () => void;
  txType: TransactionType;
  onSetExpense: () => void;
  onSetIncome: () => void;
  counterpartyType: CounterpartyType;
  onCounterpartyTypeChange: (value: CounterpartyType) => void;
  counterpartyName: string;
  onCounterpartyNameChange: (text: string) => void;
  categoriesLoading: boolean;
  visibleCategories: CategoryRow[];
  categoryId: string | null;
  onCategoryPress: (category: CategoryRow, selected: boolean) => void;
  onAddCategory: () => void;
  addCategoryDisabled: boolean;
  note: string;
  onNoteChange: (text: string) => void;
  transactionAt: Date;
  onDatePress: () => void;
  iosPickerVisible: boolean;
  onIosDateChange: (date: Date | undefined) => void;
  saveLoading: boolean;
  onSave: () => void;
  onClear: () => void;
};

export const ManualAddTransactionEditor = memo(
  function ManualAddTransactionEditor({
    amountText,
    amountFocused,
    onAmountChange,
    onAmountFocus,
    onAmountBlur,
    txType,
    onSetExpense,
    onSetIncome,
    counterpartyType,
    onCounterpartyTypeChange,
    counterpartyName,
    onCounterpartyNameChange,
    categoriesLoading,
    visibleCategories,
    categoryId,
    onCategoryPress,
    onAddCategory,
    addCategoryDisabled,
    note,
    onNoteChange,
    transactionAt,
    onDatePress,
    iosPickerVisible,
    onIosDateChange,
    saveLoading,
    onSave,
    onClear,
  }: ManualAddTransactionEditorProps) {
    const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;

    return (
      <TwoToneCard
        header={
          <ManualAddAmountSection
            amountText={amountText}
            amountFocused={amountFocused}
            onAmountChange={onAmountChange}
            onAmountFocus={onAmountFocus}
            onAmountBlur={onAmountBlur}
            txType={txType}
            onSetExpense={onSetExpense}
            onSetIncome={onSetIncome}
          />
        }
        body={
          <View style={styles.bodyInner}>
            <SelectDropdown
              label="Counterparty type"
              options={COUNTERPARTY_TYPE_OPTIONS}
              value={counterpartyType}
              onChange={onCounterpartyTypeChange}
              placeholder="Select type"
            />

            <TextField
              label="Counterparty name"
              placeholder="Who or what was this for?"
              value={counterpartyName}
              onChangeText={onCounterpartyNameChange}
            />

            <ManualAddCategorySection
              categoriesLoading={categoriesLoading}
              visibleCategories={visibleCategories}
              categoryId={categoryId}
              optionalTag={optionalTag}
              onCategoryPress={onCategoryPress}
              onAddCategory={onAddCategory}
              addCategoryDisabled={addCategoryDisabled}
            />

            <TextField
              label="Note"
              labelRight={optionalTag}
              placeholder="Add a short note"
              value={note}
              onChangeText={onNoteChange}
            />

            <ManualAddDateField
              transactionAt={transactionAt}
              onDatePress={onDatePress}
              iosPickerVisible={iosPickerVisible}
              onIosDateChange={onIosDateChange}
            />

            <BentoEditorFooter
              onClear={onClear}
              onSave={onSave}
              saveLoading={saveLoading}
            />
          </View>
        }
      />
    );
  },
);

const styles = StyleSheet.create({
  bodyInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingTop: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    color: colors.inactive,
    fontSize: 12,
  },
});
