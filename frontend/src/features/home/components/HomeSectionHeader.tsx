import { memo } from "react";
import { Pressable, Text } from "react-native";

import { ScreenSectionHeader } from "@/components/shared";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles } from "@/theme";

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
  const styles = useStyles();
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

const useStyles = createThemedStyles(({ colors }) => ({
  pill: {
    backgroundColor: colors.accentTint,
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
    color: colors.accentText,
  },
}));
