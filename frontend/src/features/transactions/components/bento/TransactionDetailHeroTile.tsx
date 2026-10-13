import { memo } from "react";
import { Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import {
  formatTransactionListAmount,
  mapTransactionRowToUi,
} from "@/features/transactions/utils/transactionDisplay";
import type { TransactionRow } from "@/features/transactions/types";

import { TRANSACTION_DETAIL_HERO_MIN_HEIGHT } from "./transactionDetailBentoTokens";
import { createThemedStyles, useTheme } from "@/theme";

type TransactionDetailHeroTileProps = {
  transaction: TransactionRow;
};

export const TransactionDetailHeroTile = memo(
  function TransactionDetailHeroTile({
    transaction,
  }: TransactionDetailHeroTileProps) {
    const styles = useStyles();
    const { scheme } = useTheme();
    const ui = mapTransactionRowToUi(transaction, scheme);
    const isCredit = ui.amount > 0;

    return (
      <View style={[styles.tile, styles.heroShadow]}>
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: ui.category.bgColor,
              borderColor: ui.category.borderColor,
            },
          ]}
        >
          <CategoryLucideIcon
            iconName={ui.category.icon_name}
            color={ui.category.color}
            size={22}
            strokeWidth={1.5}
          />
        </View>

        <View style={styles.textCol}>
          <Text style={styles.merchant} numberOfLines={2}>
            {ui.merchant}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
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
      </View>
    );
  },
);

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  heroShadow: shadows.card,
  tile: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: TRANSACTION_DETAIL_HERO_MIN_HEIGHT,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  merchant: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  amount: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 20,
    lineHeight: 26,
    flexShrink: 0,
  },
  amountCredit: {
    color: colors.success,
  },
  amountDebit: {
    color: colors.danger,
  },
}));
