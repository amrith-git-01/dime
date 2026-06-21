import { memo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { accent, accentTint } from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";

type HomeSectionHeaderProps = {
  title: string;
  onViewAll: () => void;
  /** Optional icon rendered left of "View all" pill. */
  leftAction?: React.ReactNode;
};

export const HomeSectionHeader = memo(function HomeSectionHeader({
  title,
  onViewAll,
  leftAction,
}: HomeSectionHeaderProps) {
  return (
    <ScreenSectionHeader
      title={title}
      action={
        <>
          {leftAction}
          <Pressable
            onPress={onViewAll}
            hitSlop={8}
            style={({ pressed }) => [
              styles.pill,
              pressed && styles.pillPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`View all ${title}`}
          >
            <Text style={styles.pillText}>View all</Text>
          </Pressable>
        </>
      }
    />
  );
});

const styles = StyleSheet.create({
  pill: {
    backgroundColor: accentTint,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: accent,
  },
});
