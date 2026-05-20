import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BENTO_SECTION_HEADER_GAP } from "@/components/bento/bentoLayoutTokens";
import { BentoSectionCard } from "@/components/shared";
import { typography } from "@/constants";

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
    gap: BENTO_SECTION_HEADER_GAP,
  },
  title: {
    ...typography.sectionTitle,
  },
});
