import { Check } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { iconSizes, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";

export type SettingsOptionRowProps = {
  label: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  showSeparator?: boolean;
};

/** One choice in a single-select settings list (radio semantics, check on the chosen row). */
export const SettingsOptionRow = memo(function SettingsOptionRow({
  label,
  subtitle,
  selected,
  onPress,
  showSeparator = false,
}: SettingsOptionRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        onPress={() => {
          void triggerHaptic();
          onPress();
        }}
        android_ripple={{ color: "transparent" }}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.textCol}>
          <Text style={styles.label}>{label}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.checkSlot}>
          {selected ? (
            <Check
              size={iconSizes.nav}
              color={colors.accentText}
              strokeWidth={2.2}
            />
          ) : null}
        </View>
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
    borderRadius: radius.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  checkSlot: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
}));
