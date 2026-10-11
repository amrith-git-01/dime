import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import {
  colors,
  danger,
  fontFamilies,
  ink,
  inkFaint,
  inkSoft,
  radius,
  spacing,
  success,
} from "@/constants";
import { hexToRgba } from "@/constants/colorUtils";
import { formatInrAmount } from "@/utils/currency";

import type { RecurringItem } from "../types";
import {
  formatMonthlyEquivalent,
  formatRecurringSubtitle,
} from "../utils/recurringDisplay";

export type RecurringListRowProps = {
  item: RecurringItem;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onPress: (item: RecurringItem) => void;
};

/**
 * Recurring income / subscription row, same shape as the Home and Transactions rows: category
 * tile, name + "Monthly · Due 15 Nov", signed amount. Paused items are dimmed.
 * Dividers between rows are the parent's responsibility.
 */
export const RecurringListRow = memo(function RecurringListRow({
  item,
  today,
  onPress,
}: RecurringListRowProps) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const isIncome = item.kind === "income";
  const color = item.category_color ?? colors.categoryDefault;
  const equivalent = formatMonthlyEquivalent(item);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatRecurringSubtitle(item, today)}`}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        !item.active && styles.rowPaused,
        pressed && styles.rowPressed,
      ]}
    >
      <View
        style={[styles.iconTile, { backgroundColor: hexToRgba(color, 0.1) }]}
      >
        <CategoryLucideIcon
          iconName={item.category_icon_name ?? "CreditCard"}
          color={color}
          size={18}
          strokeWidth={1.5}
        />
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {formatRecurringSubtitle(item, today)}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text
          style={[styles.amount, isIncome ? styles.credit : styles.debit]}
          numberOfLines={1}
        >
          {formatInrAmount(item.amount, {
            signed: true,
            type: isIncome ? "credit" : "debit",
          })}
        </Text>
        {equivalent ? (
          <Text style={styles.equivalent} numberOfLines={1}>
            {equivalent}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowPaused: {
    opacity: 0.55,
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
  name: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 19,
    color: ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkFaint,
  },
  amountCol: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 2,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ["tabular-nums"],
  },
  credit: {
    color: success,
  },
  debit: {
    color: danger,
  },
  equivalent: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 14,
    color: inkSoft,
  },
});
