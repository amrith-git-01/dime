import { ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

const BAR_HEIGHT = 4;
const SEGMENT_GAP = 2;
const SEGMENT_MIN_WIDTH = 4;
const LEGEND_HIT_SLOP = { top: 8, bottom: 8, left: 6, right: 6 };

export type SpendSplitKind = "recurring" | "flexible";

export type SpendSplitBarProps = {
  /** Recurring (fixed) spend, in rupees. */
  fixed: number;
  /** Flexible spend, in rupees. */
  flexible: number;
  /** Shows a "View" link on the legend row; opens the month's list. */
  onView?: () => void;
  /** Makes each legend item tappable; opens the month's list narrowed to that kind. */
  onPressKind?: (kind: SpendSplitKind) => void;
};

/**
 * Recurring vs flexible spend: a lean two-segment bar (widths proportional to the amounts, static)
 * with a labelled column under each segment. Renders nothing when there is no recurring spend.
 */
export const SpendSplitBar = memo(function SpendSplitBar({
  fixed,
  flexible,
  onView,
  onPressKind,
}: SpendSplitBarProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fixedValue = Math.max(0, fixed);
  const flexibleValue = Math.max(0, flexible);
  if (fixedValue <= 0 || fixedValue + flexibleValue <= 0) {
    return null;
  }
  const total = fixedValue + flexibleValue;
  // Percent shares keep the flex-grow sum well above 1 (a sum under 1 would not fill the bar).
  const fixedShare = (fixedValue / total) * 100;
  const flexibleShare = (flexibleValue / total) * 100;
  const fixedDisplay = formatInrCompact(fixedValue);
  const flexibleDisplay = formatInrCompact(flexibleValue);
  const fixedColor = colors.accent;
  const flexibleColor = colors.iconAccentOrange;

  const pressKind = (kind: SpendSplitKind) => () => {
    void triggerHaptic();
    onPressKind?.(kind);
  };
  const pressView = () => {
    void triggerHaptic();
    onView?.();
  };

  const renderLegendItem = (
    kind: SpendSplitKind,
    label: string,
    display: string,
    color: string,
    alignEnd: boolean,
  ) => {
    const content = (
      <>
        <View style={styles.labelRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.amount}>{display}</Text>
      </>
    );
    const itemStyle = [
      styles.legendItem,
      alignEnd && !onView ? styles.legendItemEnd : null,
    ];
    if (!onPressKind) {
      return (
        <View testID={`spend-split-legend-${kind}`} style={itemStyle}>
          {content}
        </View>
      );
    }
    return (
      <Pressable
        testID={`spend-split-legend-${kind}`}
        style={itemStyle}
        onPress={pressKind(kind)}
        hitSlop={LEGEND_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`View ${label.toLowerCase()} transactions, ${display}`}
      >
        {content}
      </Pressable>
    );
  };

  return (
    <View
      style={styles.root}
      accessible={!onPressKind && !onView}
      accessibilityLabel={`Recurring ${fixedDisplay}, Flexible ${flexibleDisplay}`}
    >
      <View style={styles.bar}>
        <View
          testID="spend-split-fixed"
          style={[
            styles.segment,
            { flexGrow: fixedShare, backgroundColor: fixedColor },
          ]}
        />
        {flexibleValue > 0 ? (
          <View
            testID="spend-split-flexible"
            style={[
              styles.segment,
              { flexGrow: flexibleShare, backgroundColor: flexibleColor },
            ]}
          />
        ) : null}
      </View>
      <View style={[styles.legend, onView ? styles.legendWithView : null]}>
        {renderLegendItem("recurring", "Recurring", fixedDisplay, fixedColor, false)}
        {renderLegendItem("flexible", "Flexible", flexibleDisplay, flexibleColor, true)}
        {onView ? (
          <Pressable
            testID="spend-split-view"
            style={styles.viewLink}
            onPress={pressView}
            hitSlop={LEGEND_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="View this month's transactions"
          >
            <Text style={styles.viewText}>View</Text>
            <ChevronRight size={14} color={colors.accentText} strokeWidth={2.25} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  root: {
    gap: spacing.sm,
  },
  bar: {
    flexDirection: "row",
    height: BAR_HEIGHT,
    gap: SEGMENT_GAP,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  segment: {
    flexBasis: 0,
    minWidth: SEGMENT_MIN_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: radius.full,
  },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legendWithView: {
    justifyContent: "flex-start",
    alignItems: "center",
    gap: spacing.lg,
  },
  legendItem: {
    gap: 2,
  },
  legendItemEnd: {
    alignItems: "flex-end",
  },
  viewLink: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  viewText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.accentText,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  amount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
}));
