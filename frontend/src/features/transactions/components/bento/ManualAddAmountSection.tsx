import { Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { SegmentChip } from "@/components/ui";
import { bento, colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { TransactionType } from "@/features/transactions/types";

import { BENTO_FORM_SECTION_PADDING } from "@/components/bento";

type ManualAddAmountSectionProps = {
  amountText: string;
  amountFocused: boolean;
  onAmountChange: (text: string) => void;
  onAmountFocus: () => void;
  onAmountBlur: () => void;
  txType: TransactionType;
  onSetExpense: () => void;
  onSetIncome: () => void;
};

export function ManualAddAmountSection({
  amountText,
  amountFocused,
  onAmountChange,
  onAmountFocus,
  onAmountBlur,
  txType,
  onSetExpense,
  onSetIncome,
}: ManualAddAmountSectionProps) {
  return (
    <View style={styles.headerInner}>
      <Text style={styles.amountKicker}>Amount</Text>
      <View
        style={[styles.amountRow, amountFocused && styles.amountRowFocused]}
      >
        <View style={styles.currencyPrefixWrap}>
          <Text style={styles.currencyPrefix}>{"\u20b9"}</Text>
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
  );
}

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
});
