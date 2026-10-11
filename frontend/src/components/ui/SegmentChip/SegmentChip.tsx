import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { bento, colors, hero, radius, spacing, surfaces } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

export type SegmentChipVariant = "default" | "onDark";

export type SegmentChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Use onDark on violet bento headers (e.g. manual add amount card). */
  variant?: SegmentChipVariant;
};

/**
 * Two-state segment chip — used on ManualAddTransactionScreen for Expense / Income toggle.
 * Extracted from the screen file so it can be reused across forms.
 */
export const SegmentChip = memo(function SegmentChip({
  label,
  selected,
  onPress,
  variant = "default",
}: SegmentChipProps) {
  const onDark = variant === "onDark";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        void triggerHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        onDark && styles.chipOnDark,
        !onDark && selected && styles.chipSelected,
        onDark && selected && styles.chipOnDarkSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.chipText,
          onDark && styles.chipTextOnDark,
          !onDark && selected && styles.chipTextOn,
          onDark && selected && styles.chipTextOnDarkSelected,
        ]}
      >
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
    paddingHorizontal: spacing.sm,
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
  chipOnDark: {
    borderColor: hero.chipBorder,
    backgroundColor: surfaces.onPrimaryChipBg,
  },
  chipOnDarkSelected: {
    backgroundColor: colors.barBackground,
    borderColor: colors.barBackground,
  },
  chipTextOnDark: {
    color: bento.onSurface.secondary,
  },
  chipTextOnDarkSelected: {
    color: colors.textPrimary,
  },
});
