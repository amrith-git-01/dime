import { memo } from "react";
import { Pressable, Text } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles } from "@/theme";

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
  const styles = useStyles();
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

const useStyles = createThemedStyles(({ colors }) => ({
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.surfaces.primaryTint10,
    borderColor: colors.accent,
  },
  chipPressed: {
    opacity: 0.92,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  chipTextOn: {
    color: colors.ink,
  },
  chipOnDark: {
    borderColor: colors.line,
    backgroundColor: colors.surfaces.onPrimaryChipBg,
  },
  chipOnDarkSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  chipTextOnDark: {
    color: colors.inkSoft,
  },
  chipTextOnDarkSelected: {
    color: colors.ink,
  },
}));
