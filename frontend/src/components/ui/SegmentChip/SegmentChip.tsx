import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, radius, spacing, surfaces } from "@/constants/theme";

export type SegmentChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Two-state segment chip — used on ManualAddTransactionScreen for Expense / Income toggle.
 * Extracted from the screen file so it can be reused across forms.
 */
export const SegmentChip = memo(function SegmentChip({
  label,
  selected,
  onPress,
}: SegmentChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pageBackground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  chipSelected: {
    backgroundColor: surfaces.primaryTint10,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.92,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  chipTextOn: {
    color: colors.textPrimary,
  },
});
