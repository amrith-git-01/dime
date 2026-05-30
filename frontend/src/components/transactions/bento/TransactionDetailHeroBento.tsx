import { memo, useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { bento, radius, spacing } from "@/constants/theme";
import { CategoryLucideIcon } from "@/features/categories/components/CategoryLucideIcon";
import { mapTransactionRowToUi } from "@/features/transactions/components/transactionListShared";
import { formatInrAmount } from "@/features/transactions/formatAmount";
import type { TransactionRow } from "@/features/transactions/types";

import { TRANSACTION_DETAIL_HERO_MIN_HEIGHT } from "./transactionDetailBentoTokens";

type TransactionDetailHeroBentoProps = {
  transaction: TransactionRow;
};

export const TransactionDetailHeroBento = memo(
  function TransactionDetailHeroBento({
    transaction,
  }: TransactionDetailHeroBentoProps) {
    const ui = useMemo(() => mapTransactionRowToUi(transaction), [transaction]);

    const categoryColor = ui.category.color;
    const typeLabel = transaction.type === "credit" ? "Income" : "Expense";

    const shadowStyle = useMemo(
      () =>
        Platform.OS === "android"
          ? { elevation: 3 }
          : {
              shadowColor: categoryColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.28,
              shadowRadius: 10,
            },
      [categoryColor],
    );

    return (
      <View
        style={[styles.tile, { backgroundColor: categoryColor }, shadowStyle]}
      >
        <View style={styles.topRow}>
          <View style={styles.iconChip}>
            <CategoryLucideIcon
              iconName={ui.category.icon_name}
              color={bento.icon.fg}
              size={20}
              strokeWidth={1.5}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.merchant} numberOfLines={2}>
              {ui.merchant}
            </Text>
            <Text style={styles.category} numberOfLines={1}>
              {ui.category.name}
            </Text>
          </View>
        </View>

        <Text style={styles.amount} selectable>
          {formatInrAmount(transaction.amount, {
            signed: true,
            type: transaction.type,
          })}
        </Text>

        <Text style={styles.meta} numberOfLines={1}>
          {typeLabel} · {ui.timeLabel} · {ui.viaLabel}
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: TRANSACTION_DETAIL_HERO_MIN_HEIGHT,
    gap: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconChip: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: bento.icon.bg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  merchant: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 18,
    lineHeight: 24,
    color: bento.onSurface.primary,
  },
  category: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: bento.onSurface.secondary,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 28,
    lineHeight: 34,
    color: bento.onSurface.primary,
  },
  meta: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: bento.onSurface.muted,
  },
});
