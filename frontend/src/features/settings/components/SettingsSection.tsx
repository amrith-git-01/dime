import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_SECTION_HEADER_GAP } from "@/components/bento";
import { BentoSectionCard } from "@/components/shared";
import { typography } from "@/constants";

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
      <BentoSectionCard>{children}</BentoSectionCard>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: BENTO_SECTION_HEADER_GAP,
  },
  title: {
    ...typography.sectionTitle,
  },
  titleCompact: {
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
});
