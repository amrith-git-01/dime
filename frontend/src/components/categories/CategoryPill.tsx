import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, radius, spacing, surfaces } from "@/constants";
import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";

export type CategoryPillProps = {
  label: string;
  iconName: string;
  iconColor: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Category selection pill — icon + label, toggleable selected state.
 * Extracted from ManualAddTransactionScreen for reuse across forms.
 */
export const CategoryPill = memo(function CategoryPill({
  label,
  iconName,
  iconColor,
  selected,
  onPress,
}: CategoryPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        pressed && styles.pillPressed,
      ]}
    >
      <CategoryLucideIcon
        iconName={iconName}
        color={iconColor}
        size={16}
        strokeWidth={1.5}
      />
      <Text style={[styles.label, selected && styles.labelOn]}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pill: {
    maxWidth: "100%",
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillSelected: {
    borderColor: colors.primary,
    backgroundColor: surfaces.primaryTint10,
  },
  pillPressed: {
    opacity: 0.92,
  },
  label: {
    flexShrink: 0,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  labelOn: {
    color: colors.textPrimary,
  },
});
