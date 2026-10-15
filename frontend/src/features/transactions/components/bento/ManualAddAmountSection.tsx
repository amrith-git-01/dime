import { Platform, Text, View } from "react-native";

import { fontFamilies, spacing } from "@/constants";
import type { TransactionType } from "@/features/transactions/types";
import {
  AppTextInput,
  SlidingSegmentedControl,
  type SlidingSegmentedOption,
} from "@/components/ui";
import { createThemedStyles, useTheme } from "@/theme";

type ManualAddAmountSectionProps = {
  amountText: string;
  amountFocused: boolean;
  onAmountChange: (text: string) => void;
  onAmountFocus: () => void;
  onAmountBlur: () => void;
  txType: TransactionType;
  onSetExpense: () => void;
  onSetIncome: () => void;
  /**
   * Show the Expense / Income switch (default). Hide it where the type is fixed by the screen
   * (recurring income / subscriptions): `txType` then only picks the amount colour.
   */
  showTypeToggle?: boolean;
  /** Inline validation message shown under the amount. */
  errorMessage?: string | null;
  /** Focus the amount input (and raise the keypad) as soon as the screen opens. */
  autoFocus?: boolean;
};

const TYPE_OPTIONS: readonly SlidingSegmentedOption<TransactionType>[] = [
  { value: "debit", label: "Expense", tone: "danger" },
  { value: "credit", label: "Income", tone: "success" },
];

export function ManualAddAmountSection({
  amountText,
  onAmountChange,
  onAmountFocus,
  onAmountBlur,
  txType,
  onSetExpense,
  onSetIncome,
  showTypeToggle = true,
  errorMessage,
  autoFocus,
}: ManualAddAmountSectionProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const handleTypeChange = (next: TransactionType) => {
    if (next === "debit") onSetExpense();
    else onSetIncome();
  };

  const hasValue = amountText !== "" && amountText !== "0";
  const amountColor = hasValue
    ? txType === "debit"
      ? colors.danger
      : colors.success
    : colors.inkFaint;

  return (
    <View style={styles.container}>
      <Text style={styles.amountKicker}>AMOUNT</Text>

      <View style={styles.amountRow}>
        <Text style={[styles.currencyPrefix, { color: amountColor }]}>
          {"\u20b9"}
        </Text>
        <AppTextInput
          containerStyle={styles.amountInputSlot}
          style={[styles.amountInput, { color: amountColor }]}
          placeholder="0"
          placeholderTextColor={colors.inkFaint}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          value={amountText}
          onChangeText={onAmountChange}
          onFocus={onAmountFocus}
          onBlur={onAmountBlur}
          underlineColorAndroid="transparent"
        />
      </View>

      {errorMessage ? (
        <Text style={styles.amountError} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : null}

      {showTypeToggle ? (
        <SlidingSegmentedControl
          options={TYPE_OPTIONS}
          value={txType}
          onChange={handleTypeChange}
        />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({

  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  amountKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.accentText,
    textTransform: "uppercase",
  },
  amountError: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.danger,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  currencyPrefix: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 42,
    fontVariant: ["tabular-nums"],
    ...Platform.select({
      android: { lineHeight: 50, includeFontPadding: false },
      default: { lineHeight: 50 },
    }),
  },
  amountInputSlot: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamilies.semiBold,
    fontSize: 42,
    fontVariant: ["tabular-nums"],
    padding: 0,
    margin: 0,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: "center",
        height: "100%",
        paddingVertical: 0,
      },
    }),
  },
}));
