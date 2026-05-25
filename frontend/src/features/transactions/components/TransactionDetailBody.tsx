import { format, parseISO } from "date-fns";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing, typography } from "@/constants/theme";
import { detectedViaLabel } from "@/features/transactions/detectedViaLabel";
import { formatInrAmount } from "@/features/transactions/formatAmount";
import type { TransactionRow } from "@/features/transactions/types";

export type TransactionDetailBodyProps = {
  transaction: TransactionRow;
};

function formatIsoHuman(iso: string | null | undefined): string {
  if (iso == null || iso.length === 0) {
    return "—";
  }
  try {
    return format(parseISO(iso), "d MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}

function DetailBlock({
  label,
  children,
  isLast,
}: {
  label: string;
  children: ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.block, isLast && styles.blockLast]}>
      <Text style={styles.blockLabel}>{label}</Text>
      {children}
    </View>
  );
}

export function TransactionDetailBody({
  transaction: tx,
}: TransactionDetailBodyProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
      bounces
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heroStrip}>
        <Text style={styles.heroMerchant} numberOfLines={2}>
          {tx.merchant || tx.counterparty_name?.trim() || "—"}
        </Text>
        <Text
          style={[
            styles.heroAmount,
            tx.type === "credit" ? styles.amountCredit : styles.amountDebit,
          ]}
        >
          {formatInrAmount(tx.amount, { signed: true, type: tx.type })}
        </Text>
      </View>

      <DetailBlock label="Category">
        <Text style={styles.bodyText} selectable>
          {tx.category ?? "Uncategorized"}
        </Text>
      </DetailBlock>

      <DetailBlock label="Detected via">
        <Text style={styles.bodyText}>{detectedViaLabel(tx.detected_via)}</Text>
      </DetailBlock>

      <DetailBlock label="When">
        <Text style={styles.bodyTextMono} selectable>
          {formatIsoHuman(tx.transaction_at)}
        </Text>
      </DetailBlock>

      <DetailBlock label="Counterparty">
        <Text style={styles.bodyText} selectable>
          {tx.counterparty_name?.trim() || "—"}
        </Text>
        <Text style={styles.caption}>{tx.counterparty_type}</Text>
      </DetailBlock>

      <DetailBlock label="Notes" isLast>
        {tx.note?.trim() ? (
          <Text style={styles.bodyText} selectable>
            {tx.note.trim()}
          </Text>
        ) : (
          <Text style={styles.muted}>—</Text>
        )}
      </DetailBlock>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl * 2,
  },
  heroStrip: {
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
    gap: spacing.xs,
  },
  heroMerchant: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  heroAmount: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 22,
    lineHeight: 30,
  },
  amountCredit: {
    color: colors.success,
  },
  amountDebit: {
    color: "#DC2626",
  },
  block: {
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  blockLast: {
    borderBottomWidth: 0,
  },
  blockLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  bodyText: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  bodyTextMono: {
    fontFamily: typography.monoEmphasis.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  caption: {
    marginTop: 4,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  muted: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
