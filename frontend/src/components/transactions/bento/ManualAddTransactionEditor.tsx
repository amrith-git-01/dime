import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BentoEditorFooter } from "@/components/bento/BentoEditorFooter";
import {
  BENTO_FORM_BODY_GAP,
  BENTO_FORM_SECTION_PADDING,
} from "@/components/bento/bentoFormTokens";
import { CategoryPill } from "@/components/categories/CategoryPill";
import { TwoToneCard } from "@/components/shared/TwoToneCard";
import { SegmentChip } from "@/components/ui/SegmentChip/SegmentChip";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { TextField } from "@/components/ui/TextField/TextField";
import { fontFamilies } from "@/constants/fonts";
import { formStyles } from "@/constants/formStyles";
import { bento, colors, radius, spacing } from "@/constants/theme";
import { AddCategoryTrigger } from "@/features/categories/components/AddCategoryTrigger";
import type { LocalCategory } from "@/features/categories/hooks/useLocalCategories";
import {
  COUNTERPARTY_TYPE_OPTIONS,
  type CounterpartyType,
} from "@/features/transactions/counterpartyTypes";
import type { TransactionType } from "@/features/transactions/types";

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
  visibleCategories: LocalCategory[];
  categoryId: string | null;
  onCategoryPress: (category: LocalCategory, selected: boolean) => void;
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
          <View style={styles.headerInner}>
            <Text style={styles.amountKicker}>Amount</Text>
            <View
              style={[
                styles.amountRow,
                amountFocused && styles.amountRowFocused,
              ]}
            >
              <View style={styles.currencyPrefixWrap}>
                <Text style={styles.currencyPrefix}>₹</Text>
              </View>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={bento.onPastel.muted}
                keyboardType="decimal-pad"
                value={amountText}
                onChangeText={onAmountChange}
                onFocus={onAmountFocus}
                onBlur={onAmountBlur}
                underlineColorAndroid="transparent"
              />
            </View>
            <View style={styles.segmentRow}>
              <SegmentChip
                label="Expense"
                selected={txType === "debit"}
                onPress={onSetExpense}
              />
              <SegmentChip
                label="Income"
                selected={txType === "credit"}
                onPress={onSetIncome}
              />
            </View>
          </View>
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

            <View>
              <View style={styles.labelRow}>
                <Text style={formStyles.fieldLabel}>Category</Text>
                {optionalTag}
              </View>
              {categoriesLoading ? (
                <View style={styles.categoriesLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <View style={styles.categoryGrid}>
                  {visibleCategories.map((category) => {
                    const selected = categoryId === category.id;
                    return (
                      <CategoryPill
                        key={category.id}
                        label={category.name}
                        iconName={category.icon_name}
                        iconColor={category.color}
                        selected={selected}
                        onPress={() => onCategoryPress(category, selected)}
                      />
                    );
                  })}
                  <AddCategoryTrigger
                    disabled={addCategoryDisabled}
                    onPress={onAddCategory}
                  />
                </View>
              )}
            </View>

            <TextField
              label="Note"
              labelRight={optionalTag}
              placeholder="Add a short note"
              value={note}
              onChangeText={onNoteChange}
            />

            <View>
              <Text style={formStyles.fieldLabel}>Date</Text>
              <Pressable
                accessibilityRole="button"
                onPress={onDatePress}
                style={({ pressed }) => [
                  styles.dateRow,
                  pressed && styles.dateRowPressed,
                ]}
              >
                <Text style={styles.dateValue}>
                  {format(transactionAt, "MMM d, yyyy")}
                </Text>
                <ChevronRight
                  size={20}
                  color={colors.inactive}
                  strokeWidth={2}
                />
              </Pressable>
            </View>

            {iosPickerVisible ? (
              <View style={styles.iosPickerWrap}>
                <DateTimePicker
                  value={transactionAt}
                  mode="date"
                  display="compact"
                  themeVariant="light"
                  onChange={(_e, date) => onIosDateChange(date)}
                />
              </View>
            ) : null}

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
  headerInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingTop: BENTO_FORM_SECTION_PADDING,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  amountKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: bento.twoToneBodySurface,
  },
  amountRowFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.barBackground,
  },
  currencyPrefixWrap: {
    marginRight: spacing.xs,
    justifyContent: "center",
    ...Platform.select({
      android: { height: 26 },
    }),
  },
  currencyPrefix: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: bento.onPastel.primary,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        lineHeight: 26,
      },
      default: {
        lineHeight: 30,
      },
    }),
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 24,
    color: bento.onPastel.primary,
    padding: 0,
    margin: 0,
    ...Platform.select({
      android: {
        height: "100%",
        paddingVertical: 0,
        includeFontPadding: false,
        textAlignVertical: "center",
        lineHeight: 26,
      },
      ios: {
        lineHeight: 30,
        paddingVertical: 2,
      },
    }),
  },
  segmentRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  bodyInner: {
    paddingHorizontal: BENTO_FORM_SECTION_PADDING,
    paddingTop: BENTO_FORM_SECTION_PADDING,
    paddingBottom: BENTO_FORM_SECTION_PADDING,
    gap: BENTO_FORM_BODY_GAP,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  optionalHint: {
    fontFamily: fontFamilies.regular,
    color: colors.inactive,
    fontSize: 12,
  },
  categoriesLoading: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.pageBackground,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  dateRow: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.pageBackground,
  },
  dateRowPressed: {
    backgroundColor: colors.barBackground,
  },
  dateValue: {
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  iosPickerWrap: {
    alignItems: "flex-start",
  },
});
