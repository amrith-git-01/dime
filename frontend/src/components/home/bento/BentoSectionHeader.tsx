import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { colors, typography } from "@/constants/theme";

import { HOME_SECTION_HEADER_GAP } from "./homeBentoTokens";

export type BentoSectionHeaderProps = {
  title: string;
  viewAllLabel?: string;
  onViewAll: () => void;
};

/**
 * Section title + "View all" chevron row — shared between HomeCategoriesBento
 * and HomeRecentSection (and any future home sections).
 */
export const BentoSectionHeader = memo(function BentoSectionHeader({
  title,
  viewAllLabel = "View all",
  onViewAll,
}: BentoSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onViewAll}
        style={({ pressed }) => [styles.viewAll, pressed && styles.viewAllPressed]}
      >
        <Text style={styles.viewAllText}>{viewAllLabel}</Text>
        <ChevronRight size={14} color={colors.primary} strokeWidth={2} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: HOME_SECTION_HEADER_GAP,
  },
  title: {
    ...typography.sectionTitle,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllPressed: {
    opacity: 0.65,
  },
  viewAllText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
});
