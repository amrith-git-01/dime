import { memo } from "react";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

const BAR_HEIGHT = 6;
const SEGMENT_GAP = 2;
const SEGMENT_MIN_WIDTH = 4;
const COMMITTED_OPACITY = 0.35;

export type SpendSplitBarProps = {
  /** Recurring (fixed) spend, in rupees. */
  fixed: number;
  /** Flexible spend, in rupees. */
  flexible: number;
  /**
   * Monthly budget, in rupees. With one, the bar is the budget: the filled part is the spend split
   * into recurring and flexible, and the unfilled track is what is left. Without one the bar is
   * only the recurring / flexible proportions of the spend.
   */
  budget?: number;
  /** Recurring still to come this month, in rupees; drawn pale after the spend, clamped to the budget. */
  committed?: number;
  /** Centres the legend line (for centred cards). */
  centered?: boolean;
};

/**
 * The month's single bar: spend split into recurring and flexible, optionally inside the budget
 * (with the recurring still to come as a pale segment), and one quiet legend line under it.
 * Without a budget it renders nothing when there is no recurring spend.
 */
/** A finite amount, at least 0 (a not-yet-loaded NaN reads as 0). */
function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export const SpendSplitBar = memo(function SpendSplitBar({
  fixed,
  flexible,
  budget = 0,
  committed = 0,
  centered = false,
}: SpendSplitBarProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fixedValue = nonNegative(fixed);
  const flexibleValue = nonNegative(flexible);
  const budgetValue = nonNegative(budget);
  const hasBudget = budgetValue > 0;
  const spent = fixedValue + flexibleValue;
  if (!hasBudget && (fixedValue <= 0 || spent <= 0)) {
    return null;
  }

  const overBudget = hasBudget && spent >= budgetValue;
  // Percent shares keep the flex-grow sum well above 1 (a sum under 1 would not fill the bar).
  const scale = hasBudget && !overBudget ? budgetValue : spent;
  const fixedShare = scale > 0 ? (fixedValue / scale) * 100 : 0;
  const flexibleShare = scale > 0 ? (flexibleValue / scale) * 100 : 0;
  const committedValue =
    hasBudget && !overBudget ? Math.min(nonNegative(committed), budgetValue - spent) : 0;
  const committedShare = hasBudget && committedValue > 0 ? (committedValue / budgetValue) * 100 : 0;
  const trackShare = hasBudget && !overBudget
    ? Math.max(0, 100 - fixedShare - flexibleShare - committedShare)
    : 0;

  const fixedColor = colors.accent;
  const flexibleColor = colors.iconAccentOrange;
  // The accent tint is too faint on the track, so the committed part is the accent at low opacity.
  const committedColor = colors.accent;
  const fixedDisplay = formatInrCompact(fixedValue);
  const flexibleDisplay = formatInrCompact(flexibleValue);
  const committedDisplay = formatInrCompact(committedValue);

  const legendItems: {
    key: string;
    label: string;
    display: string;
    color: string;
    opacity?: number;
  }[] = [];
  if (fixedValue > 0) {
    legendItems.push({ key: "recurring", label: "Recurring", display: fixedDisplay, color: fixedColor });
  }
  if (flexibleValue > 0) {
    legendItems.push({ key: "flexible", label: "Flexible", display: flexibleDisplay, color: flexibleColor });
  }
  if (committedValue > 0) {
    legendItems.push({
      key: "committed",
      label: "Still to come",
      display: committedDisplay,
      color: committedColor,
      opacity: COMMITTED_OPACITY,
    });
  }
  const summaryLabel = legendItems.map((item) => `${item.label} ${item.display}`).join(", ");

  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={summaryLabel}
    >
      <View
        style={[
          styles.bar,
          hasBudget ? { backgroundColor: colors.surfaceSunken } : null,
        ]}
      >
        {fixedValue > 0 ? (
          <View
            testID="spend-split-fixed"
            style={[styles.segment, { flexGrow: fixedShare, backgroundColor: fixedColor }]}
          />
        ) : null}
        {flexibleValue > 0 ? (
          <View
            testID="spend-split-flexible"
            style={[styles.segment, { flexGrow: flexibleShare, backgroundColor: flexibleColor }]}
          />
        ) : null}
        {committedShare > 0 ? (
          <View
            testID="spend-split-committed"
            style={[
              styles.segment,
              { flexGrow: committedShare, backgroundColor: committedColor, opacity: COMMITTED_OPACITY },
            ]}
          />
        ) : null}
        {trackShare > 0 ? (
          <View testID="spend-split-track" style={[styles.track, { flexGrow: trackShare }]} />
        ) : null}
      </View>
      {legendItems.length === 0 ? null : (
        <View
          style={[styles.legend, centered ? styles.legendCentered : null]}
          testID="spend-split-legend"
        >
          {legendItems.map((item) => (
            <View key={item.key} style={styles.legendItem}>
              <View
                style={[styles.dot, { backgroundColor: item.color, opacity: item.opacity ?? 1 }]}
              />
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={styles.amount} numberOfLines={1}>
                {item.display}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  track: {
    flexBasis: 0,
    height: BAR_HEIGHT,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.md,
    rowGap: 2,
  },
  legendCentered: {
    justifyContent: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  amount: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
}));
