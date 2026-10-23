import { memo, useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { isPendingTransactionRow } from "@/features/outbox/utils/pendingMerge";
import type { TransactionRow as TransactionRowData } from "@/features/transactions/types";
import {
  formatTransactionListAmount,
  mapTransactionRowToUi,
} from "@/features/transactions/utils/transactionDisplay";
import { createThemedStyles, useTheme } from "@/theme";

import { RecurringBadge } from "./RecurringBadge";
import { WaitingToSyncPill } from "./WaitingToSyncPill";

export type TransactionRowProps = {
  transaction: TransactionRowData;
  onPress: (tx: TransactionRowData) => void;
};

/**
 * Shared transaction row used in both the Home screen and Transactions screen.
 * Renders icon tile, merchant name, category+time subtitle, and tabular amount.
 * Dividers between rows are the parent's responsibility.
 */
export const TransactionRow = memo(function TransactionRow({
  transaction,
  onPress,
}: TransactionRowProps) {
  const styles = useStyles();
  const { scheme } = useTheme();
  const ui = useMemo(
    () => mapTransactionRowToUi(transaction, scheme),
    [transaction, scheme],
  );
  const isCredit = ui.amount > 0;
  const isPending = isPendingTransactionRow(transaction);
  const handlePress = useCallback(
    () => onPress(transaction),
    [onPress, transaction],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={isPending ? "Waiting to sync. Opens the pending list" : undefined}
      onPress={handlePress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconTile, { backgroundColor: ui.category.bgColor }]}>
        <CategoryLucideIcon
          iconName={ui.category.icon_name}
          color={ui.category.color}
          size={18}
          strokeWidth={1.5}
        />
      </View>
      <View style={styles.meta}>
        <Text style={styles.merchant} numberOfLines={1}>
          {ui.merchant}
        </Text>
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle} numberOfLines={1}>
            {ui.category.name} · {ui.timeLabel}
          </Text>
          {ui.isRecurring ? <RecurringBadge /> : null}
          {isPending ? <WaitingToSyncPill /> : null}
        </View>
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

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowPressed: {
    opacity: 0.85,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  merchant: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
    color: colors.ink,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  subtitle: {
    flexShrink: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    flexShrink: 0,
    fontVariant: ["tabular-nums"],
  },
  amountCredit: {
    color: colors.success,
  },
  amountDebit: {
    color: colors.danger,
  },
}));
