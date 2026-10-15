import type { LucideIcon } from "lucide-react-native";
import { ArrowLeftRight, HelpCircle, Store, User } from "lucide-react-native";
import { memo, useState } from "react";
import {
  Pressable,
  Text,
  View,
} from "react-native";

import { BentoEditorFooter } from "@/components/bento";
import { AppTextInput } from "@/components/ui";
import { fontFamilies, radius, spacing } from "@/constants";
import type { CategoryRow } from "@/features/categories/types";
import { type CounterpartyType } from "@/features/transactions/counterpartyTypes";
import type { TransactionType } from "@/features/transactions/types";

import { ManualAddAmountSection } from "./ManualAddAmountSection";
import { ManualAddCategorySection } from "./ManualAddCategorySection";
import { ManualAddDateField } from "./ManualAddDateField";
import { createThemedStyles, useTheme } from "@/theme";

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
  /** Recurring categories that fit the type; shown as a collapsible group (income also gets the card). */
  recurringCategories?: CategoryRow[];
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
    recurringCategories,
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
    const { colors } = useTheme();
    const styles = useStyles();
    const [nameFocused, setNameFocused] = useState(false);
    const [noteFocused, setNoteFocused] = useState(false);

    const saveDisabled =
      !amountText || amountText === "0" || amountText === "0.00";

    const optionalTag = <Text style={styles.optionalHint}>(optional)</Text>;
    const requiredTag = <Text style={styles.requiredHint}>(required)</Text>;

    return (
      <View style={styles.content}>
        {/* Amount card */}
        <View style={[styles.amountCard, styles.cardShadow]}>
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

        {/* Category card: expense always; income only to offer recurring income (Income is auto-assigned) */}
        {txType === "debit" || (recurringCategories?.length ?? 0) > 0 ? (
          <View style={[styles.card, styles.cardShadow]}>
            <View style={styles.cardHeader}>
              <Text style={styles.sectionLabel}>CATEGORY</Text>
              {txType === "debit" ? requiredTag : optionalTag}
            </View>
            <ManualAddCategorySection
              categoriesLoading={categoriesLoading}
              visibleCategories={visibleCategories}
              categoryId={categoryId}
              onCategoryPress={onCategoryPress}
              onAddCategory={txType === "debit" ? onAddCategory : undefined}
              addCategoryDisabled={addCategoryDisabled}
              recurringCategories={recurringCategories}
            />
          </View>
        ) : null}

        {/* Counterparty card */}
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>COUNTERPARTY NAME</Text>
            {requiredTag}
          </View>
          <AppTextInput
            style={[
              styles.nameInput,
              styles.nameInputFirst,
              nameFocused && styles.nameInputFocused,
            ]}
            placeholder={NAME_PLACEHOLDER[counterpartyType]}
            placeholderTextColor={colors.inkFaint}
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
                    color={selected ? colors.ink : colors.inkSoft}
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
        <View style={[styles.card, styles.cardShadow]}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionLabel}>NOTE</Text>
            {optionalTag}
          </View>
          <AppTextInput
            style={[styles.nameInput, noteFocused && styles.nameInputFocused]}
            placeholder="Add a short note"
            placeholderTextColor={colors.inkFaint}
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

        <BentoEditorFooter
          onClear={onClear}
          onSave={onSave}
          saveLoading={saveLoading}
          saveDisabled={saveDisabled}
        />
      </View>
    );
  },
);

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  cardShadow: shadows.card,
  content: {
    gap: spacing.lg,
  },
  amountCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  card: {
    backgroundColor: colors.surface,
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
    color: colors.accentText,
    textTransform: "uppercase",
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkFaint,
  },
  requiredHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    color: colors.inkSoft,
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
    borderColor: colors.line,
  },
  chipSelected: {
    backgroundColor: colors.accentTint,
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  chipLabelSelected: {
    fontFamily: fontFamilies.medium,
    color: colors.ink,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: colors.ink,
    paddingHorizontal: 12,
    minHeight: 44,
    backgroundColor: colors.surface,
  },
  nameInputFirst: {
    marginTop: spacing.sm,
  },
  nameInputFocused: {
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  dateRow: {
    paddingHorizontal: 4,
  },
  clearText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    color: colors.inkSoft,
  },
  saveText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    color: colors.onAccent,
  },
}));
