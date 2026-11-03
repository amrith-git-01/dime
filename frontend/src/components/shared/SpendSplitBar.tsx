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
  /**
   * Recurring still to come this month, in rupees. Drawn pale after the spend (clamped to the
   * budget) and named in a "+₹ due" caption under Recurring.
   */
  committed?: number;
  /** Draws the breakdown row under the bar: Recurring, Flexible and, with a budget, what is left. */
  showBreakdown?: boolean;
  /** Centres the breakdown text (for centred cards). */
  centered?: boolean;
};

/** A finite amount, at least 0 (a not-yet-loaded NaN reads as 0). */
function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * The month's single bar: spend split into recurring and flexible, optionally inside the budget
 * (with the recurring still to come as a pale segment), and one row of equal columns under it:
 * Recurring, Flexible and, with a budget, what is left (or how far over). Without a budget it
 * renders nothing when there is no recurring spend and none still to come.
 */
export const SpendSplitBar = memo(function SpendSplitBar({
  fixed,
  flexible,
  budget = 0,
  committed = 0,
  showBreakdown = true,
  centered = false,
}: SpendSplitBarProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fixedValue = nonNegative(fixed);
  const flexibleValue = nonNegative(flexible);
  const budgetValue = nonNegative(budget);
  const dueValue = nonNegative(committed);
  const hasBudget = budgetValue > 0;
  const spent = fixedValue + flexibleValue;
  if (!hasBudget && fixedValue <= 0 && dueValue <= 0) {
    return null;
  }

  const showBar = hasBudget || fixedValue > 0;
  const overBudget = hasBudget && spent > budgetValue;
  // Percent shares keep the flex-grow sum well above 1 (a sum under 1 would not fill the bar).
  const scale = hasBudget && !overBudget ? budgetValue : spent;
  const fixedShare = scale > 0 ? (fixedValue / scale) * 100 : 0;
  const flexibleShare = scale > 0 ? (flexibleValue / scale) * 100 : 0;
  const committedValue =
    hasBudget && !overBudget ? Math.min(dueValue, budgetValue - spent) : 0;
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
  const dueDisplay = formatInrCompact(dueValue);
  const budgetDisplay = formatInrCompact(budgetValue);
  const leftDisplay = formatInrCompact(overBudget ? spent - budgetValue : budgetValue - spent);

  const summaryParts = [`Recurring ${fixedDisplay}`, `Flexible ${flexibleDisplay}`];
  if (dueValue > 0) {
    summaryParts.push(`Still to come ${dueDisplay}`);
  }
  if (hasBudget) {
    summaryParts.push(
      overBudget ? `Over budget by ${leftDisplay}` : `${leftDisplay} left of ${budgetDisplay}`,
    );
  }
  const summaryLabel = summaryParts.join(", ");
  const textAlign = centered ? styles.centeredText : null;
  const columnStyle = [styles.column, centered ? styles.columnCentered : null];

  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={summaryLabel}
    >
      {showBar ? (
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
      ) : null}
      {showBreakdown ? (
        <View style={styles.columns} testID="spend-split-breakdown">
          <View style={columnStyle}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: fixedColor }]} />
              <Text style={styles.label} numberOfLines={1}>
                Recurring
              </Text>
            </View>
            <Text style={[styles.amount, textAlign]} numberOfLines={1}>
              {fixedDisplay}
            </Text>
            {dueValue > 0 ? (
              <Text style={[styles.caption, textAlign]} numberOfLines={1}>
                {`+${dueDisplay} due`}
              </Text>
            ) : null}
          </View>
          <View style={columnStyle}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: flexibleColor }]} />
              <Text style={styles.label} numberOfLines={1}>
                Flexible
              </Text>
            </View>
            <Text style={[styles.amount, textAlign]} numberOfLines={1}>
              {flexibleDisplay}
            </Text>
          </View>
          {hasBudget ? (
            <View style={[styles.column, centered ? styles.columnCentered : styles.columnEnd]}>
              <Text style={[styles.label, centered ? styles.centeredText : styles.endText]} numberOfLines={1}>
                {overBudget ? "Over by" : `Left of ${budgetDisplay}`}
              </Text>
              <Text
                style={[
                  styles.amount,
                  centered ? styles.centeredText : styles.endText,
                  { color: overBudget ? colors.danger : colors.accentText },
                ]}
                numberOfLines={1}
              >
                {leftDisplay}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
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
  columns: {
    flexDirection: "row",
    columnGap: spacing.sm,
  },
  column: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  columnCentered: {
    alignItems: "center",
  },
  columnEnd: {
    alignItems: "flex-end",
  },
  centeredText: {
    textAlign: "center",
  },
  endText: {
    textAlign: "right",
  },
  labelRow: {
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
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
  },
  amount: {
    fontFamily: fontFamilies.medium,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkFaint,
    fontVariant: ["tabular-nums"],
  },
}));
