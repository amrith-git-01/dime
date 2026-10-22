import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

export type InsightsMonthSwitcherProps = {
  selectedMonth: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

/** Previous / next month arrows around the month's name, at the top of the Insights screen. */
export const InsightsMonthSwitcher = memo(function InsightsMonthSwitcher({
  selectedMonth,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
}: InsightsMonthSwitcherProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPrevMonth}
        disabled={!canGoPrevMonth}
        hitSlop={8}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
      >
        <ChevronLeft
          size={18}
          color={canGoPrevMonth ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
      <Text style={styles.monthLabel} accessibilityRole="header">
        {selectedMonth}
      </Text>
      <Pressable
        onPress={onNextMonth}
        disabled={!canGoNextMonth}
        hitSlop={8}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel="Next month"
      >
        <ChevronRight
          size={18}
          color={canGoNextMonth ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  navBtn: {
    padding: spacing.xs,
  },
  monthLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    minWidth: 120,
    textAlign: "center",
  },
}));
