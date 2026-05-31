import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, colors } from "@/constants/theme";

export type BentoStatCellTone =
  | "neutral"
  | "credit"
  | "debit"
  | "net-positive"
  | "net-negative";

export type BentoStatCellProps = {
  label: string;
  value: string;
  tone?: BentoStatCellTone;
};

/**
 * Shared cash-flow stat cell — uppercase label + mono value with semantic tone.
 * Used in HomeIncomeExpenseTile, TransactionsMonthBentoCard, BudgetMonthBentoCard.
 */

/** Maps a net numeric value to the correct BentoStatCellTone for sign-aware coloring. */
export function netTone(netValue: number): BentoStatCellTone {
  if (netValue > 0) return "net-positive";
  if (netValue < 0) return "net-negative";
  return "neutral";
}

export const BentoStatCell = memo(function BentoStatCell({
  label,
  value,
  tone = "neutral",
}: BentoStatCellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          (tone === "credit" || tone === "net-positive") && styles.valueCredit,
          (tone === "debit" || tone === "net-negative") && styles.valueDebit,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  label: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
  },
  valueCredit: {
    color: colors.success,
  },
  valueDebit: {
    color: colors.danger,
  },
});
