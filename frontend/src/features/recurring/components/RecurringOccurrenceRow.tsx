import { Check } from "lucide-react-native";
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
import { formatInrAmount } from "@/utils/currency";

import type { RecurringOccurrence } from "../types";
import { formatOccurrenceSubtitle } from "../utils/recurringDisplay";
import { createThemedStyles, useTheme } from "@/theme";

export type RecurringOccurrenceRowProps = {
  occurrence: RecurringOccurrence;
  /** Start of the current local day, for the due-date wording. */
  today: Date;
  onPress?: (occurrence: RecurringOccurrence) => void;
  /** Replaces the "Paid 1 Oct" / "Due 15 Nov" line (e.g. "Upcoming" inside a day card). */
  subtitle?: string;
  /** Ghost look for an occurrence that is not a real transaction yet. */
  dimmed?: boolean;
};

/**
 * One recurring item in a given month: category tile, name, "Paid 1 Oct" (with a check) or "Due 15 Nov",
 * and the amount (what was actually posted once paid). Dividers are the parent's responsibility.
 */
export const RecurringOccurrenceRow = memo(function RecurringOccurrenceRow({
  occurrence,
  today,
  onPress,
  subtitle: subtitleOverride,
  dimmed = false,
}: RecurringOccurrenceRowProps) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const handlePress = useCallback(
    () => onPress?.(occurrence),
    [occurrence, onPress],
  );
  const isIncome = occurrence.kind === "income";
  const isPaid = occurrence.status === "paid";
  const isSkipped = occurrence.status === "skipped";
  const color = readableCategoryColor(
    occurrence.category?.color ?? categoryDefault,
    scheme,
  );
  const subtitle = subtitleOverride ?? formatOccurrenceSubtitle(occurrence, today);
  const amount =
    isPaid && occurrence.posted_amount
      ? occurrence.posted_amount
      : occurrence.amount;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${occurrence.name}, ${subtitle}`}
      disabled={!onPress}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        (isSkipped || dimmed) && styles.rowSkipped,
        pressed && styles.rowPressed,
      ]}
    >
      <View
        style={[
          styles.iconTile,
          { backgroundColor: withAlpha(color, colors.categoryTileAlpha) },
        ]}
      >
        <CategoryLucideIcon
          iconName={occurrence.category?.icon_name ?? "CreditCard"}
          color={color}
          size={18}
          strokeWidth={1.5}
        />
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={2}>
          {occurrence.name}
        </Text>
        <View style={styles.subtitleRow}>
          {isPaid ? (
            <Check size={12} color={colors.success} strokeWidth={2.5} />
          ) : null}
          <Text
            style={[styles.subtitle, isPaid && styles.subtitlePaid]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      <Text
        style={[
          styles.amount,
          isIncome ? styles.credit : styles.debit,
          !isPaid && styles.amountPending,
        ]}
        numberOfLines={1}
      >
        {formatInrAmount(amount, {
          signed: true,
          type: isIncome ? "credit" : "debit",
        })}
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
  rowSkipped: {
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
    color: colors.ink,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkFaint,
  },
  subtitlePaid: {
    color: colors.success,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  amountPending: {
    opacity: 0.7,
  },
  credit: {
    color: colors.success,
  },
  debit: {
    color: colors.danger,
  },
}));
