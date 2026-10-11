import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { fontFamilies, inkSoft } from "@/constants";

import { SETTINGS_SECTION_HEADER_GAP } from "../constants/settingsTokens";
import { SettingsSurfaceCard } from "./SettingsSurfaceCard";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
  /** Smaller section label (notifications inbox). */
  compact?: boolean;
};

export const SettingsSection = memo(function SettingsSection({
  title,
  children,
  compact = false,
}: SettingsSectionProps) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, compact && styles.titleCompact]}>
        {title}
      </Text>
      <SettingsSurfaceCard padded={false}>
        <View style={styles.cardInner}>{children}</View>
      </SettingsSurfaceCard>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: SETTINGS_SECTION_HEADER_GAP,
  },
  title: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: inkSoft,
  },
  titleCompact: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
  cardInner: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});
