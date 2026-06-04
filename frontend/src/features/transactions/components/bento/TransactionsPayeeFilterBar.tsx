import { memo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { bento, colors, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type TransactionsPayeeFilterBarProps = {
  payeeLabel: string;
  transactionCount: number;
};

function transactionCountLabel(count: number): string {
  if (count === 1) {
    return "1 TRANSACTION";
  }
  return `${count} TRANSACTIONS`;
}

export const TransactionsPayeeFilterBar = memo(
  function TransactionsPayeeFilterBar({
    payeeLabel,
    transactionCount,
  }: TransactionsPayeeFilterBarProps) {
    return (
      <View style={[styles.bar, shadowStyle]}>
        <View style={styles.center}>
          <Text style={styles.eyebrow} numberOfLines={1}>
            PAYEE
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {payeeLabel}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {transactionCountLabel(transactionCount)}
          </Text>
        </View>
      </View>
    );
  },
);

const shadowStyle = Platform.select({
  android: { elevation: 2 },
  default: {
    shadowColor: bento.surface.lavender,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});

const styles = StyleSheet.create({
  bar: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: bento.sectionSurface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  eyebrow: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.4,
    color: bento.onPastel.muted,
    textAlign: "center",
  },
  title: {
    marginTop: 2,
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 2,
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.4,
    color: colors.primary,
    textAlign: "center",
  },
});
