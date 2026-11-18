import { Platform, Text, View } from "react-native";

import { fontFamilies, spacing } from "@/constants";
import type { TransactionKind, TransactionType } from "@/features/transactions/types";
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
  /**
   * The Spend / Income / Transfer selector (manual add and edit). When given it replaces the Expense / Income
   * switch; a Transfer also shows which way the money went (`txType`, `onSetExpense`, `onSetIncome`). A row that
   * is a payback (a refund or reimbursement, linked to a spend) keeps showing it as a fourth choice.
   */
  kind?: TransactionKind;
  onSelectKind?: (kind: TransactionKind) => void;
  /** Inline validation message shown under the amount. */
  errorMessage?: string | null;
  /** Focus the amount input (and raise the keypad) as soon as the screen opens. */
  autoFocus?: boolean;
};

const TYPE_OPTIONS: readonly SlidingSegmentedOption<TransactionType>[] = [
  { value: "debit", label: "Expense", tone: "danger" },
  { value: "credit", label: "Income", tone: "success" },
];

const KIND_OPTIONS: readonly SlidingSegmentedOption<TransactionKind>[] = [
  { value: "spend", label: "Spend", tone: "danger" },
  { value: "income", label: "Income", tone: "success" },
  { value: "transfer", label: "Transfer" },
];

const KIND_OPTIONS_WITH_PAYBACK: readonly SlidingSegmentedOption<TransactionKind>[] = [
  ...KIND_OPTIONS,
  { value: "payback", label: "Payback", tone: "success" },
];

const DIRECTION_OPTIONS: readonly SlidingSegmentedOption<TransactionType>[] = [
  { value: "debit", label: "Money out" },
  { value: "credit", label: "Money in" },
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
  kind,
  onSelectKind,
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
  // A transfer is in neither spent nor income: its amount is drawn quiet, not red or green.
  const amountColor = !hasValue
    ? colors.inkFaint
    : kind === "transfer"
      ? colors.inkSoft
      : txType === "debit"
        ? colors.danger
        : colors.success;

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

      {onSelectKind && kind ? (
        <>
          <SlidingSegmentedControl
            options={kind === "payback" ? KIND_OPTIONS_WITH_PAYBACK : KIND_OPTIONS}
            value={kind}
            onChange={onSelectKind}
          />
          {kind === "transfer" ? (
            <>
              <SlidingSegmentedControl
                options={DIRECTION_OPTIONS}
                value={txType}
                onChange={handleTypeChange}
              />
              <Text style={styles.kindHint}>
                Moving your own money (between accounts, a cash withdrawal, a card bill). It stays in your list but is not counted as spent or earned.
              </Text>
            </>
          ) : null}
        </>
      ) : showTypeToggle ? (
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
  kindHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
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
