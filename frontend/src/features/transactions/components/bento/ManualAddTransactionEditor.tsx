import type { LucideIcon } from "lucide-react-native";
import { ArrowLeftRight, HelpCircle, Store, User } from "lucide-react-native";
import { memo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  BUTTON_LOADER_SIZE,
  InfinityButtonLoader,
} from "@/components/ui";
import {
  accent,
  accentTint,
  fontFamilies,
  ink,
  inkFaint,
  inkSoft,
  line,
  radius,
  shadow,
  spacing,
  surface,
} from "@/constants";
import type { CategoryRow } from "@/features/categories/types";
import { type CounterpartyType } from "@/features/transactions/counterpartyTypes";
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
  onTimePress: () => void;
  iosPickerMode: "date" | "time" | null;
  onIosPickerChange: (mode: "date" | "time", date: Date | undefined) => void;
  saveLoading: boolean;
  onSave: () => void;
  onClear: () => void;
};

type ChipConfig = {
  type: CounterpartyType;
  Icon: LucideIcon;
  label: string;
};

const COUNTERPARTY_CHIPS: ChipConfig[] = [
  { type: "merchant", Icon: Store, label: "Shop" },
  { type: "person", Icon: User, label: "Person" },
  { type: "self_transfer", Icon: ArrowLeftRight, label: "Transfer" },
  { type: "unknown", Icon: HelpCircle, label: "Unknown" },
];

const NAME_PLACEHOLDER: Record<CounterpartyType, string> = {
  merchant: "e.g. Swiggy, Amazon, BigBasket",
  person: "e.g. Rahul, Mom, Arjun",
  self_transfer: "e.g. ICICI to HDFC savings",
  unknown: "What was this for?",
};

const cardShadow = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
});

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
    onTimePress,
    iosPickerMode,
    onIosPickerChange,
    saveLoading,
    onSave,
    onClear,
  }: ManualAddTransactionEditorProps) {
    const [nameFocused, setNameFocused] = useState(false);
    const [noteFocused, setNoteFocused] = useState(false);

    const saveDisabled =
      !amountText || amountText === "0" || amountText === "0.00";

    const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;
    const requiredTag = <Text style={styles.requiredHint}>(required)</Text>;

    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Amount card */}
        <View style={[styles.amountCard, cardShadow]}>
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
        </View>

        {/* Category card — expense only; income auto-assigns Income category */}
        {txType === "debit" ? (
          <View style={[styles.card, cardShadow]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>CATEGORY</Text>
              {requiredTag}
            </View>
            <ManualAddCategorySection
              categoriesLoading={categoriesLoading}
              visibleCategories={visibleCategories}
              categoryId={categoryId}
              onCategoryPress={onCategoryPress}
              onAddCategory={onAddCategory}
              addCategoryDisabled={addCategoryDisabled}
            />
          </View>
        ) : null}

        {/* Counterparty card */}
        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>COUNTERPARTY NAME</Text>
            {requiredTag}
          </View>
          <TextInput
            style={[
              styles.nameInput,
              styles.nameInputFirst,
              nameFocused && styles.nameInputFocused,
            ]}
            placeholder={NAME_PLACEHOLDER[counterpartyType]}
            placeholderTextColor={inkFaint}
            value={counterpartyName}
            onChangeText={onCounterpartyNameChange}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            returnKeyType="next"
          />
          <View style={[styles.cardHeader, styles.cardHeaderSpaced]}>
            <Text style={styles.sectionLabel}>COUNTERPARTY TYPE</Text>
            {requiredTag}
          </View>
          <View style={styles.chipsRow}>
            {COUNTERPARTY_CHIPS.map(({ type, Icon, label }) => {
              const selected = counterpartyType === type;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onCounterpartyTypeChange(type)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.chipPressed,
                  ]}
                >
                  <Icon
                    size={16}
                    color={selected ? ink : inkSoft}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={[
                      styles.chipLabel,
                      selected && styles.chipLabelSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Note card */}
        <View style={[styles.card, cardShadow]}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>NOTE</Text>
            {optionalTag}
          </View>
          <TextInput
            style={[styles.nameInput, noteFocused && styles.nameInputFocused]}
            placeholder="Add a short note"
            placeholderTextColor={inkFaint}
            value={note}
            onChangeText={onNoteChange}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => setNoteFocused(false)}
            returnKeyType="done"
          />
        </View>

        {/* Date & Time row (no card) */}
        <View style={styles.dateRow}>
          <ManualAddDateField
            transactionAt={transactionAt}
            onDatePress={onDatePress}
            onTimePress={onTimePress}
            iosPickerMode={iosPickerMode}
            onIosPickerChange={onIosPickerChange}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            style={styles.clearBtn}
            onPress={onClear}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={saveDisabled}
          >
            {saveLoading ? (
              <InfinityButtonLoader color={surface} size={BUTTON_LOADER_SIZE} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    );
  },
);

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  amountCard: {
    backgroundColor: surface,
    borderRadius: radius.lg,
  },
  card: {
    backgroundColor: surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  cardHeaderSpaced: {
    marginTop: spacing.md,
    marginBottom: 0,
  },
  sectionLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: accent,
    textTransform: "uppercase",
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: inkFaint,
  },
  requiredHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: inkSoft,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: line,
  },
  chipSelected: {
    backgroundColor: accentTint,
    borderColor: accent,
    borderWidth: 1.5,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
  chipLabelSelected: {
    fontFamily: fontFamilies.medium,
    color: ink,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: radius.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: ink,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: surface,
  },
  nameInputFirst: {
    marginTop: spacing.sm,
  },
  nameInputFocused: {
    borderColor: accent,
    borderWidth: 1.5,
  },
  dateRow: {
    paddingHorizontal: 4,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  clearBtn: {
    flex: 1,
    height: 50,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: line,
    alignItems: "center",
    justifyContent: "center",
  },
  clearText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    color: inkSoft,
  },
  saveBtn: {
    flex: 2,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: surface,
  },
});
