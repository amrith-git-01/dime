import { memo } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";

export type SettingsToggleRowProps = {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  showSeparator?: boolean;
};

export const SettingsToggleRow = memo(function SettingsToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
  showSeparator = false,
}: SettingsToggleRowProps) {
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.textCol}>
          <Text style={styles.label}>{label}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Switch
          accessibilityLabel={label}
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.barBackground}
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
    paddingVertical: spacing.md,
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
    lineHeight: 20,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});
