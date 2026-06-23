import { Pencil } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { ProgressBar } from "@/components/ui";
import {
  ink,
  inkSoft,
  line,
  radius,
  shadows,
  spacing,
  surface,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import { formatInrCompact } from "@/utils/currency";

export type CategorySpendRowData = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  spentMonth: number;
  is_system: boolean;
  monthlyCap?: number | null;
};

type CategorySpendBentoRowProps = {
  item: CategorySpendRowData;
  /** Home screen: share of overall monthly budget when no per-category cap. */
  hasMonthlyBudget?: boolean;
  monthlyBudgetAmount?: number;
  nameWraps?: boolean;
  /** Opens filtered transaction list for this category (budget tab). */
  onPress?: () => void;
  /** Budget tab: opens category editor when the tile badge is pressed. */
  onEditPress?: () => void;
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
    prev.onPress === next.onPress &&
    prev.onEditPress === next.onEditPress &&
    prevItem.id === nextItem.id &&
    prevItem.name === nextItem.name &&
    prevItem.icon_name === nextItem.icon_name &&
    prevItem.color === nextItem.color &&
    prevItem.spentMonth === nextItem.spentMonth &&
    prevItem.is_system === nextItem.is_system &&
    prevItem.monthlyCap === nextItem.monthlyCap
  );
}

export const CategorySpendBentoRow = memo(function CategorySpendBentoRow({
  item,
  hasMonthlyBudget = false,
  monthlyBudgetAmount = 0,
  nameWraps = false,
  onPress,
  onEditPress,
}: CategorySpendBentoRowProps) {
  const cap = item.monthlyCap ?? null;
  const hasCategoryCap = cap != null && cap > 0;

  const progress = hasCategoryCap
    ? Math.min(1, item.spentMonth / cap)
    : hasMonthlyBudget && monthlyBudgetAmount > 0
      ? Math.min(1, item.spentMonth / monthlyBudgetAmount)
      : 0;

  const subtitle = hasCategoryCap
    ? `Cap ${formatInrCompact(cap)} · ${Math.round(Math.min(1, item.spentMonth / cap) * 100)}% used`
    : hasMonthlyBudget
      ? `${Math.round(Math.min(1, item.spentMonth / monthlyBudgetAmount) * 100)}% of monthly budget`
      : null;

  const showProgress = hasCategoryCap || hasMonthlyBudget;

  const row = (
    <>
      <View style={styles.catLeft}>
        <View style={styles.catTileWrap}>
          <View
            style={[styles.catTile, { backgroundColor: `${item.color}14` }]}
          >
            <CategoryLucideIcon
              iconName={item.icon_name}
              color={item.color}
              size={18}
              strokeWidth={1.5}
            />
          </View>
          {onEditPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.name}`}
              hitSlop={6}
              onPress={() => {
                void triggerLightHaptic();
                onEditPress();
              }}
              style={({ pressed }) => [
                styles.editBadge,
                pressed && styles.editBadgePressed,
              ]}
            >
              <Pencil size={13} color={inkSoft} strokeWidth={2} />
            </Pressable>
          ) : null}
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
          {subtitle ? (
            <Text style={styles.catBudgetText}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.catRight}>
        <Text style={styles.catSpent}>{formatInrCompact(item.spentMonth)}</Text>
        {showProgress ? (
          <View style={styles.catProgressWrap}>
            <ProgressBar
              progress={progress}
              fillColor={item.color}
              backgroundColor={`${item.color}14`}
              height={8}
            />
          </View>
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={styles.categoryRow}>{row}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View transactions for ${item.name}`}
      onPress={() => {
        void triggerLightHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.categoryRow,
        pressed && styles.categoryRowPressed,
      ]}
    >
      {row}
    </Pressable>
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
    paddingVertical: spacing.md,
  },
  categoryRowPressed: {
    opacity: 0.88,
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flex: 1,
  },
  catTileWrap: {
    position: "relative",
    overflow: "visible",
  },
  catTile: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  editBadge: {
    position: "absolute",
    top: -9,
    right: -9,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: surface,
    borderWidth: 1,
    borderColor: line,
    ...shadows.card,
  },
  editBadgePressed: {
    opacity: 0.88,
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
    color: ink,
    flexShrink: 1,
  },
  customPill: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  customPillText: {
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 12,
    color: inkSoft,
  },
  catBudgetText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
    marginTop: 3,
  },
  catRight: {
    flexShrink: 0,
    alignItems: "flex-end",
  },
  catSpent: {
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 15,
    lineHeight: 21,
    color: ink,
  },
  catProgressWrap: {
    marginTop: spacing.xs,
    width: CATEGORY_SPEND_PROGRESS_WIDTH,
  },
});
