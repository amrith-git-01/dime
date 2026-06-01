import type { LucideIcon } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { bento, iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type BentoActionPillProps = {
  label: string;
  onPress: () => void;
  backgroundColor?: string;
  accessibilityLabel?: string;
  icon?: LucideIcon;
  trailing?: ReactNode;
  disabled?: boolean;
};

/**
 * Compact filled pill (manual quick-add style) — shared by section headers and empty-state actions.
 */
export const BentoActionPill = memo(function BentoActionPill({
  label,
  onPress,
  backgroundColor = bento.actionIcon.manual,
  accessibilityLabel,
  icon: Icon,
  trailing,
  disabled = false,
}: BentoActionPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor },
        disabled && styles.pillDisabled,
        pressed && !disabled && styles.pillPressed,
      ]}
    >
      {Icon ? (
        <Icon
          size={iconSizes.quickAdd}
          color={bento.onSurface.primary}
          strokeWidth={2}
        />
      ) : null}
      <Text style={styles.pillLabel}>{label}</Text>
      {trailing}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
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
    color: bento.onSurface.primary,
  },
});
