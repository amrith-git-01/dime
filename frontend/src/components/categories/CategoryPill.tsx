import { memo } from "react";
import { Pressable, Text } from "react-native";

import { fontFamilies, radius, spacing } from "@/constants";
import { CategoryLucideIcon } from "@/components/categories/CategoryLucideIcon";
import { createThemedStyles } from "@/theme";

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
  const styles = useStyles();
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

const useStyles = createThemedStyles(({ colors }) => ({
  pill: {
    maxWidth: "100%",
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillSelected: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    backgroundColor: colors.accentTint,
  },
  pillPressed: {
    opacity: 0.85,
  },
  label: {
    flexShrink: 0,
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  labelOn: {
    color: colors.ink,
  },
}));
