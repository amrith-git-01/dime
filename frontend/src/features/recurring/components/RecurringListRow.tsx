import { Pencil } from "lucide-react-native";
import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import {
  categoryDefault,
  fontFamilies,
  radius,
  readableCategoryColor,
  spacing,
  withAlpha,
} from "@/constants";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrAmount } from "@/utils/currency";

import type { RecurringItem } from "../types";
import {
  formatMonthlyEquivalent,
  formatRecurringSubtitle,
} from "../utils/recurringDisplay";
import { createThemedStyles, useTheme } from "@/theme";

export type RecurringListRowProps = {
  item: RecurringItem;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onPress: (item: RecurringItem) => void;
  /** Shows a pencil badge on the icon tile that opens the item's editor (as the category rows have). */
  onEdit?: (item: RecurringItem) => void;
};

/**
 * Recurring income / subscription row, same shape as the Home and Transactions rows: category
 * tile, name + "Monthly · Due 15 Nov", signed amount. Paused items are dimmed. With `onEdit` the
 * tile carries an edit pencil and the row itself means "view this item's transactions".
 * Dividers between rows are the parent's responsibility.
 */
export const RecurringListRow = memo(function RecurringListRow({
  item,
  today,
  onPress,
  onEdit,
}: RecurringListRowProps) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const handleEdit = useCallback(() => {
    void triggerHaptic();
    onEdit?.(item);
  }, [item, onEdit]);
  const isIncome = item.kind === "income";
  const color = readableCategoryColor(
    item.category_color ?? categoryDefault,
    scheme,
  );
  const equivalent = formatMonthlyEquivalent(item);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        onEdit
          ? `View transactions for ${item.name}`
          : `${item.name}, ${formatRecurringSubtitle(item, today)}`
      }
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        !item.active && styles.rowPaused,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.tileWrap}>
        <View
          style={[styles.iconTile, { backgroundColor: withAlpha(color, colors.categoryTileAlpha) }]}
        >
          <CategoryLucideIcon
            iconName={item.category_icon_name ?? "CreditCard"}
            color={color}
            size={18}
            strokeWidth={1.5}
          />
        </View>
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            hitSlop={6}
            onPress={handleEdit}
            style={({ pressed }) => [styles.editBadge, pressed && styles.editBadgePressed]}
          >
            <Pencil size={12} color={colors.inkSoft} strokeWidth={2} />
          </Pressable>
        ) : null}
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

const useStyles = createThemedStyles(({ colors, shadows }) => ({
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
  tileWrap: {
    position: "relative",
    overflow: "visible",
    flexShrink: 0,
  },
  editBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  editBadgePressed: {
    opacity: 0.88,
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
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
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
    color: colors.success,
  },
  debit: {
    color: colors.danger,
  },
  equivalent: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
  },
}));
