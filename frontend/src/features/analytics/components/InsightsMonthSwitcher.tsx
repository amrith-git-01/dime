import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { spacing } from "@/constants/spacing";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

export type InsightsMonthSwitcherProps = {
  selectedMonth: string;
  /** Label of the month the arrows lead to; named in the button labels when known. */
  prevMonthLabel?: string;
  nextMonthLabel?: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

/** Month arrows at the top of Insights; every card below follows the month shown here. */
export const InsightsMonthSwitcher = memo(function InsightsMonthSwitcher({
  selectedMonth,
  prevMonthLabel,
  nextMonthLabel,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
}: InsightsMonthSwitcherProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  // The button labels name the month they lead to, and the live region announces the new month after a tap.
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPrevMonth}
        disabled={!canGoPrevMonth}
        hitSlop={12}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel={
          prevMonthLabel ? `Previous month, ${prevMonthLabel}` : "Previous month"
        }
      >
        <ChevronLeft
          size={18}
          color={canGoPrevMonth ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
      <Text style={styles.monthLabel} accessibilityLiveRegion="polite">
        {selectedMonth}
      </Text>
      <Pressable
        onPress={onNextMonth}
        disabled={!canGoNextMonth}
        hitSlop={12}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel={
          nextMonthLabel ? `Next month, ${nextMonthLabel}` : "Next month"
        }
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
    gap: spacing.sm,
  },
  // 18px chevron + padding + hitSlop 12 = a 48dp target.
  navBtn: {
    padding: spacing.xs,
  },
  monthLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    minWidth: 96,
    textAlign: "center",
  },
}));
