import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { ProgressBar } from "@/components/ui";
import { colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { formatInrCompact } from "@/utils/currency";

export type CategorySpendRowData = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  spentMonth: number;
  is_system: boolean;
};

type CategorySpendBentoRowProps = {
  item: CategorySpendRowData;
  hasMonthlyBudget: boolean;
  monthlyBudgetAmount: number;
  /** When true, category name wraps instead of truncating (e.g. custom-category preview). */
  nameWraps?: boolean;
};

function categorySpendRowPropsAreEqual(
  prev: CategorySpendBentoRowProps,
  next: CategorySpendBentoRowProps,
): boolean {
  const prevItem = prev.item;
  const nextItem = next.item;
  return (
    prev.nameWraps === next.nameWraps &&
    prev.hasMonthlyBudget === next.hasMonthlyBudget &&
    prev.monthlyBudgetAmount === next.monthlyBudgetAmount &&
    prevItem.id === nextItem.id &&
    prevItem.name === nextItem.name &&
    prevItem.icon_name === nextItem.icon_name &&
    prevItem.color === nextItem.color &&
    prevItem.spentMonth === nextItem.spentMonth &&
    prevItem.is_system === nextItem.is_system
  );
}

export const CategorySpendBentoRow = memo(function CategorySpendBentoRow({
  item,
  hasMonthlyBudget,
  monthlyBudgetAmount,
  nameWraps = false,
}: CategorySpendBentoRowProps) {
  const shareOfMonthlyCap =
    hasMonthlyBudget && monthlyBudgetAmount > 0
      ? Math.min(1, item.spentMonth / monthlyBudgetAmount)
      : 0;

  return (
    <View style={styles.categoryRow}>
      <View style={styles.catLeft}>
        <View style={[styles.catTile, { backgroundColor: `${item.color}22` }]}>
          <CategoryLucideIcon
            iconName={item.icon_name}
            color={item.color}
            size={18}
            strokeWidth={1.5}
          />
        </View>
        <View style={styles.catMeta}>
          <View style={styles.catNameRow}>
            <Text
              style={styles.catName}
              numberOfLines={nameWraps ? undefined : 1}
            >
              {item.name}
            </Text>
            {!item.is_system ? (
              <View style={styles.customPill}>
                <Text style={styles.customPillText}>Custom</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.catBudgetText}>
            {hasMonthlyBudget ? "Share of monthly budget" : "Spent this month"}
          </Text>
        </View>
      </View>
      <View style={styles.catRight}>
        <Text style={styles.catSpent}>{formatInrCompact(item.spentMonth)}</Text>
        {hasMonthlyBudget ? (
          <View style={styles.catProgressWrap}>
            <ProgressBar
              progress={shareOfMonthlyCap}
              fillColor={item.color}
              backgroundColor={`${item.color}14`}
              height={8}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}, categorySpendRowPropsAreEqual);

/** Keeps the budget subtitle on one line beside category meta on home/budget rows. */
const CATEGORY_SPEND_PROGRESS_WIDTH = 68;

const styles = StyleSheet.create({
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  catTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  catMeta: {
    flex: 1,
    minWidth: 0,
  },
  catNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 1,
  },
  catName: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  customPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  customPillText: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 12,
    color: colors.textSecondary,
  },
  catBudgetText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  catRight: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  catSpent: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
  catProgressWrap: {
    marginTop: spacing.xs,
    width: CATEGORY_SPEND_PROGRESS_WIDTH,
  },
});
