import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { ProgressBar } from "@/components/ui";
import {
  categoryDefault,
  radius,
  readableCategoryColor,
  spacing,
  withAlpha,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { InsightsCard } from "@/features/analytics/components/InsightsCard";
import { createThemedStyles, useTheme, type ThemeColors } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

import type { ForecastCategory, ForecastCategoryStatus } from "../types";
import {
  categoryReference,
  sortCategoriesAhead,
  toRupees,
} from "../utils/forecastFormat";

/** More categories than this start folded behind "Show more". */
export const CATEGORIES_AHEAD_COLLAPSED_ROWS = 5;

type CategoriesAheadCardProps = {
  categories: readonly ForecastCategory[];
  onCategoryPress: (category: ForecastCategory) => void;
};

function statusColor(
  status: ForecastCategoryStatus,
  colors: ThemeColors,
): string {
  if (status === "over") return colors.danger;
  if (status === "hot") return colors.warning;
  return colors.success;
}

/** The status in words, so it never rests on color alone. */
export function categoryStatusLabel(category: ForecastCategory): string {
  const reference = categoryReference(category);
  if (category.status === "over") {
    return reference?.label === "usual" ? "Over usual" : "Over budget";
  }
  if (category.status === "hot") return "Running hot";
  return "On track";
}

/** Where each category is heading by month end, against its budget (or its usual spend). */
export const CategoriesAheadCard = memo(function CategoriesAheadCard({
  categories,
  onCategoryPress,
}: CategoriesAheadCardProps) {
  const styles = useStyles();
  const [showAll, setShowAll] = useState(false);
  const sorted = sortCategoriesAhead(categories);
  const hidden = showAll
    ? 0
    : Math.max(0, sorted.length - CATEGORIES_AHEAD_COLLAPSED_ROWS);
  const visible = hidden > 0 ? sorted.slice(0, CATEGORIES_AHEAD_COLLAPSED_ROWS) : sorted;

  return (
    <InsightsCard
      kicker="CATEGORIES AHEAD"
      subtitle="Where each category is heading by month end"
    >
      <View style={styles.list}>
        {visible.map((category, index) => (
          <View key={category.id ?? `uncategorized-${index}`}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <CategoryAheadRow
              category={category}
              onPress={() => onCategoryPress(category)}
            />
          </View>
        ))}
        {hidden > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Show ${hidden} more`}
            hitSlop={8}
            onPress={() => setShowAll(true)}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          >
            <Text style={styles.moreText}>{`Show ${hidden} more`}</Text>
          </Pressable>
        ) : null}
      </View>
    </InsightsCard>
  );
});

function CategoryAheadRow({
  category,
  onPress,
}: {
  category: ForecastCategory;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const styles = useStyles();
  const accent = readableCategoryColor(category.color ?? categoryDefault, scheme);
  const reference = categoryReference(category);
  const projected = toRupees(category.p50);
  const tone = statusColor(category.status, colors);
  const statusText = categoryStatusLabel(category);
  const referenceText = reference
    ? `${reference.label === "budget" ? "of" : "usual"} ${formatInrCompact(reference.amount)}${reference.label === "budget" ? " budget" : ""}`
    : "no budget set";
  const spoken = `${category.name}, heading for ${formatInrCompact(category.p50)}, ${referenceText}. ${statusText}`;

  const row = (
    <View style={styles.row}>
      <View style={styles.top}>
        <View
          style={[
            styles.tile,
            { backgroundColor: withAlpha(accent, colors.categoryTileAlpha) },
          ]}
        >
          <CategoryLucideIcon
            iconName={category.iconName ?? "Package"}
            color={category.color ?? categoryDefault}
            size={16}
          />
        </View>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>
            {category.name}
          </Text>
          <Text style={[styles.status, { color: tone }]}>{statusText}</Text>
        </View>
        <View style={styles.amounts}>
          <Text style={styles.projected}>{formatInrCompact(projected)}</Text>
          <Text style={styles.reference}>{referenceText}</Text>
        </View>
      </View>
      {reference ? (
        <ProgressBar
          progress={projected / reference.amount}
          height={6}
          fillColor={tone}
          backgroundColor={colors.surfaceSunken}
        />
      ) : null}
    </View>
  );

  return category.id === null ? (
    <View accessible accessibilityLabel={spoken}>
      {row}
    </View>
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens this category's transactions"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {row}
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  row: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  status: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  amounts: {
    alignItems: "flex-end",
    gap: 2,
  },
  projected: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  reference: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  more: {
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
  },
  moreText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
}));
