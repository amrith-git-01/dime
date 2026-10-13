import type { LucideIcon } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, Text } from "react-native";

import { iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

export type BentoActionPillProps = {
  label: string;
  onPress: () => void;
  backgroundColor?: string;
  accessibilityLabel?: string;
  icon?: LucideIcon;
  trailing?: ReactNode;
  disabled?: boolean;
  /** Stretch to parent width; label stays centered. */
  fullWidth?: boolean;
};

/**
 * Compact filled pill (manual quick-add style) — shared by section headers and empty-state actions.
 */
export const BentoActionPill = memo(function BentoActionPill({
  label,
  onPress,
  backgroundColor,
  accessibilityLabel,
  icon: Icon,
  trailing,
  disabled = false,
  fullWidth = false,
}: BentoActionPillProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        fullWidth && styles.pillFullWidth,
        backgroundColor != null && { backgroundColor },
        disabled && styles.pillDisabled,
        pressed && !disabled && styles.pillPressed,
      ]}
    >
      {Icon ? (
        <Icon
          size={iconSizes.quickAdd}
          color={colors.onInk}
          strokeWidth={2}
        />
      ) : null}
      <Text style={styles.pillLabel}>{label}</Text>
      {trailing}
    </Pressable>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.bento.actionIcon,
  },
  pillFullWidth: {
    alignSelf: "stretch",
    justifyContent: "center",
  },
  pillDisabled: {
    opacity: 0.45,
  },
  pillPressed: {
    opacity: 0.82,
  },
  pillLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.onInk,
  },
}));
