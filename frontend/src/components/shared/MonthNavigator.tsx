import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View, type ViewProps } from "react-native";

import { spacing } from "@/constants/spacing";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme } from "@/theme";

export type MonthNavigatorProps = {
  /** The full month name and year, e.g. "November 2026". */
  label: string;
  /** Label of the month the arrows lead to; named in the button labels when known. */
  prevLabel?: string;
  nextLabel?: string;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Passed to the wrapping row: a tour target, a test id or an outer margin. */
  containerProps?: ViewProps;
};

/** The one month navigator: arrows sit right beside the label, centred, with the month named for screen readers. */
export const MonthNavigator = memo(function MonthNavigator({
  label,
  prevLabel,
  nextLabel,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  containerProps,
}: MonthNavigatorProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  // The button labels name the month they lead to, and the live region announces the new month after a tap.
  return (
    <View {...containerProps} style={[styles.row, containerProps?.style]}>
      <Pressable
        onPress={onPrev}
        disabled={!canGoPrev}
        hitSlop={12}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel={prevLabel ? `Previous month, ${prevLabel}` : "Previous month"}
        accessibilityState={{ disabled: !canGoPrev }}
      >
        <ChevronLeft
          size={18}
          color={canGoPrev ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
      <Text style={styles.label} numberOfLines={1} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Pressable
        onPress={onNext}
        disabled={!canGoNext}
        hitSlop={12}
        style={styles.navBtn}
        accessibilityRole="button"
        accessibilityLabel={nextLabel ? `Next month, ${nextLabel}` : "Next month"}
        accessibilityState={{ disabled: !canGoNext }}
      >
        <ChevronRight
          size={18}
          color={canGoNext ? colors.inkSoft : colors.inkFaint}
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
  // Wide enough for "September 2026", so the arrows stay put between short and long month names.
  label: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    minWidth: 128,
    textAlign: "center",
  },
}));
