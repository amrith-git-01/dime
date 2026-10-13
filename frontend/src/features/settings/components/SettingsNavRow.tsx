import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";

import { SETTINGS_NAV_ICON_WELL_SIZE } from "../constants/settingsTokens";
import { createThemedStyles, useTheme } from "@/theme";

export type SettingsNavRowProps = {
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  onPress: () => void;
  showSeparator?: boolean;
};

export const SettingsNavRow = memo(function SettingsNavRow({
  label,
  subtitle,
  icon: Icon,
  onPress,
  showSeparator = false,
}: SettingsNavRowProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void triggerHaptic();
          onPress();
        }}
        android_ripple={{ color: "transparent" }}
        style={styles.row}
      >
        <View style={styles.iconWell}>
          <Icon size={20} color={colors.accentText} strokeWidth={2} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.label}>{label}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={colors.inkFaint} strokeWidth={2} />
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  iconWell: {
    width: SETTINGS_NAV_ICON_WELL_SIZE,
    height: SETTINGS_NAV_ICON_WELL_SIZE,
    borderRadius: radius.sm,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
    borderRadius: radius.sm,
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: SETTINGS_NAV_ICON_WELL_SIZE + spacing.md + spacing.sm,
    marginRight: spacing.sm,
  },
}));
