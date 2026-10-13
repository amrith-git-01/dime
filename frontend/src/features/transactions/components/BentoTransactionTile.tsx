import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { TransactionRow } from "@/features/transactions/types";
import {
  formatTransactionListAmount,
  mapTransactionRowToUi,
} from "@/features/transactions/utils/transactionDisplay";

import { BENTO_TRANSACTION_TILE_MIN_HEIGHT } from "@/components/bento";
import { createThemedStyles, useTheme } from "@/theme";

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
  const styles = useStyles();
  const { scheme } = useTheme();
  const ui = useMemo(
    () => mapTransactionRowToUi(transaction, scheme),
    [transaction, scheme],
  );
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
        styles.txShadow,
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

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  txShadow: shadows.card,
  tile: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: BENTO_TRANSACTION_TILE_MIN_HEIGHT,
    gap: spacing.sm,
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surfaces.whiteOverlay55,
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
    color: colors.ink,
  },
  time: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
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
}));
