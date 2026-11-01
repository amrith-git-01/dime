import { memo } from "react";
import { Text, View } from "react-native";

import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { createThemedStyles, useTheme } from "@/theme";
import { formatInrCompact } from "@/utils/currency";

const BAR_HEIGHT = 10;
const SEGMENT_GAP = 2;
const SEGMENT_MIN_WIDTH = 6;

export type SpendSplitBarProps = {
  /** Recurring (fixed) spend, in rupees. */
  fixed: number;
  /** Flexible spend, in rupees. */
  flexible: number;
};

/**
 * Recurring vs flexible spend: a two-segment bar (widths proportional to the amounts, static)
 * with a labelled column under each segment. Renders nothing when there is no recurring spend.
 */
export const SpendSplitBar = memo(function SpendSplitBar({
  fixed,
  flexible,
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

  return (
    <View
      style={styles.root}
      accessible
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
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.labelRow}>
            <View style={[styles.dot, { backgroundColor: fixedColor }]} />
            <Text style={styles.label}>Recurring</Text>
          </View>
          <Text style={styles.amount}>{fixedDisplay}</Text>
        </View>
        <View style={[styles.legendItem, styles.legendItemEnd]}>
          <View style={styles.labelRow}>
            <View style={[styles.dot, { backgroundColor: flexibleColor }]} />
            <Text style={styles.label}>Flexible</Text>
          </View>
          <Text style={styles.amount}>{flexibleDisplay}</Text>
        </View>
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
  legendItem: {
    gap: 2,
  },
  legendItemEnd: {
    alignItems: "flex-end",
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
