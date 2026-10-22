import { memo } from "react";
import { Pressable, Text } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles } from "@/theme";

type ForecastActionChipProps = {
  label: string;
  onPress: () => void;
  /** `primary` is the answer Dime hopes for; `neutral` is the quiet alternative. */
  tone?: "primary" | "neutral";
  accessibilityLabel?: string;
};

/** A small pill for the answers on Coming up and Watch cards. */
export const ForecastActionChip = memo(function ForecastActionChip({
  label,
  onPress,
  tone = "neutral",
  accessibilityLabel,
}: ForecastActionChipProps) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      onPress={() => {
        void triggerHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        tone === "primary" ? styles.chipPrimary : styles.chipNeutral,
        pressed && styles.chipPressed,
      ]}
    >
      <Text
        style={[
          styles.label,
          tone === "primary" ? styles.labelPrimary : styles.labelNeutral,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipPrimary: {
    backgroundColor: colors.accentTint,
  },
  chipNeutral: {
    backgroundColor: colors.surfaceSunken,
  },
  chipPressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  labelPrimary: {
    color: colors.accentText,
  },
  labelNeutral: {
    color: colors.inkSoft,
  },
}));
