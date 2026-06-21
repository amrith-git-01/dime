import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ink, inkFaint, inkSoft, line, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

export type SettingsNavRowIconAccent = {
  backgroundColor: string;
  iconColor: string;
};

export type SettingsNavRowProps = {
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  iconAccent: SettingsNavRowIconAccent;
  onPress: () => void;
  showSeparator?: boolean;
};

const ICON_WELL_SIZE = 44;

export const SettingsNavRow = memo(function SettingsNavRow({
  label,
  subtitle,
  icon: Icon,
  iconAccent,
  onPress,
  showSeparator = false,
}: SettingsNavRowProps) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View
          style={[
            styles.iconWell,
            { backgroundColor: iconAccent.backgroundColor },
          ]}
        >
          <Icon size={22} color={iconAccent.iconColor} strokeWidth={2} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.label}>{label}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={20} color={inkFaint} strokeWidth={2} />
      </Pressable>
      {showSeparator ? <View style={styles.separator} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  iconWell: {
    width: ICON_WELL_SIZE,
    height: ICON_WELL_SIZE,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
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
    lineHeight: 20,
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
    marginLeft: ICON_WELL_SIZE + spacing.md,
    marginVertical: spacing.xs,
  },
});
