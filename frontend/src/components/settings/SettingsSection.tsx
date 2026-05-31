import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BentoSectionCard } from "@/components/home/bento/BentoSectionCard";
import { HOME_SECTION_HEADER_GAP } from "@/components/home/bento/homeBentoTokens";
import { typography } from "@/constants/theme";

type SettingsSectionProps = {
  title: string;
  children: ReactNode;
};

export const SettingsSection = memo(function SettingsSection({
  title,
  children,
}: SettingsSectionProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <BentoSectionCard>{children}</BentoSectionCard>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: HOME_SECTION_HEADER_GAP,
  },
  title: {
    ...typography.sectionTitle,
  },
});
