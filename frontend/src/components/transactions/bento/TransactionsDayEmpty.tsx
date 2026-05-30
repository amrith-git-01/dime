import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BentoQuickAddPills } from "@/components/home/bento/BentoQuickAddPills";
import { BentoSectionCard } from "@/components/home/bento/BentoSectionCard";
import { fontFamilies } from "@/constants/fonts";
import { bento, colors, spacing } from "@/constants/theme";

export type TransactionsDayEmptyProps = {
  variant: "month-loading" | "day-loading" | "empty";
  monthHasNoTransactions: boolean;
  onManualAdd: () => void;
  onReceipt: () => void;
  onVoice: () => void;
};

export const TransactionsDayEmpty = memo(function TransactionsDayEmpty({
  variant,
  monthHasNoTransactions,
  onManualAdd,
  onReceipt,
  onVoice,
}: TransactionsDayEmptyProps) {
  if (variant === "month-loading") {
    return null;
  }

  if (variant === "day-loading") {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading this day…</Text>
      </View>
    );
  }

  return (
    <BentoSectionCard>
      <View style={styles.emptyInner}>
        <Text style={styles.emptyTitle}>
          {monthHasNoTransactions
            ? "No transactions here"
            : "No transactions on this day"}
        </Text>
        <Text style={styles.emptyHint}>
          {monthHasNoTransactions
            ? "No transactions are available for this period."
            : "Try another day or add a transaction."}
        </Text>
        {monthHasNoTransactions ? (
          <BentoQuickAddPills
            onManualAdd={onManualAdd}
            onReceipt={onReceipt}
            onVoice={onVoice}
          />
        ) : null}
      </View>
    </BentoSectionCard>
  );
});

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyInner: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  emptyTitle: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: bento.onPastel.primary,
    textAlign: "center",
  },
  emptyHint: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: bento.onPastel.secondary,
    textAlign: "center",
    marginTop: spacing.xs,
  },
});
