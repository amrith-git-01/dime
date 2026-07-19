import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { LottieToggle } from "@/components/ui";
import { ink, inkSoft, line, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type SettingsToggleRowProps = {
  label?: string;
  /** Defaults to `label`, then `subtitle`. */
  accessibilityLabel?: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  showSeparator?: boolean;
  disabled?: boolean;
  onAnimationBusyChange?: (busy: boolean) => void;
};

export const SettingsToggleRow = memo(function SettingsToggleRow({
  label,
  accessibilityLabel,
  subtitle,
  value,
  onValueChange,
  showSeparator = false,
  disabled = false,
  onAnimationBusyChange,
}: SettingsToggleRowProps) {
  const resolvedA11yLabel =
    accessibilityLabel ?? label ?? subtitle ?? "Toggle setting";

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.textCol}>
          {label ? <Text style={styles.label}>{label}</Text> : null}
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <LottieToggle
          accessibilityLabel={resolvedA11yLabel}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          onAnimationBusyChange={onAnimationBusyChange}
        />
      </View>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
  },
});
