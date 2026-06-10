import { memo, useCallback, useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { colors, radius, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { TransactionRow } from "@/features/transactions/types";
import {
  formatTransactionListAmount,
  mapTransactionRowToUi,
} from "@/features/transactions/utils/transactionDisplay";

import { BENTO_TRANSACTION_TILE_MIN_HEIGHT } from "@/components/bento";

type BentoTransactionTileProps = {
  transaction: TransactionRow;
  onPress: (tx: TransactionRow) => void;
};

/**
 * Mini-bento tile for recent transactions.
 * Pastel background from category tint (10% alpha hex) — list order, bento styling.
 * Design-system §3.5.
 */
export const BentoTransactionTile = memo(function BentoTransactionTile({
  transaction,
  onPress,
}: BentoTransactionTileProps) {
  const ui = useMemo(() => mapTransactionRowToUi(transaction), [transaction]);
  const isCredit = ui.amount > 0;
  const handlePress = useCallback(
    () => onPress(transaction),
    [onPress, transaction],
  );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.tile,
        txShadowStyle,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, { borderColor: ui.category.borderColor }]}>
        <CategoryLucideIcon
          iconName={ui.category.icon_name}
          color={ui.category.color}
          size={18}
          strokeWidth={1.5}
        />
      </View>

      <View style={styles.textCol}>
        <Text style={styles.merchant} numberOfLines={1}>
          {ui.merchant}
        </Text>
        <Text style={styles.time} numberOfLines={1}>
          {ui.category.name} · {ui.timeLabel}
        </Text>
      </View>

      <Text
        style={[
          styles.amount,
          isCredit ? styles.amountCredit : styles.amountDebit,
        ]}
        numberOfLines={1}
      >
        {formatTransactionListAmount(ui.amount)}
      </Text>
    </Pressable>
  );
});

const txShadowStyle = Platform.select({
  android: { elevation: 1 },
  default: {
    shadowColor: colors.shadowBrand,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
});

const styles = StyleSheet.create({
  tile: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: BENTO_TRANSACTION_TILE_MIN_HEIGHT,
    gap: spacing.sm,
    backgroundColor: colors.barBackground,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: surfaces.whiteOverlay55,
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  merchant: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textListPrimary,
  },
  time: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textListSecondary,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 0,
  },
  amountCredit: {
    color: colors.success,
  },
  amountDebit: {
    color: colors.danger,
  },
});
