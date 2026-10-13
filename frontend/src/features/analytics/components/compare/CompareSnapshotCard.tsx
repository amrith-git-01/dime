import { memo } from "react";
import { Text, View } from "react-native";

import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";

import { InsightsCard } from "../InsightsCard";
import { createThemedStyles } from "@/theme";

type CompareSnapshotCardProps = {
  leftLabel: string;
  rightLabel: string;
  leftAmount: number;
  rightAmount: number;
  spentDelta: string | null;
  isDeltaPositive: boolean | null;
};

const MAX_BAR_HEIGHT = 80;

function formatAmount(amount: number): string {
  if (amount === 0) return "—";
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toFixed(0)}`;
}

export const CompareSnapshotCard = memo(function CompareSnapshotCard({
  leftLabel,
  rightLabel,
  leftAmount,
  rightAmount,
  spentDelta,
  isDeltaPositive,
}: CompareSnapshotCardProps) {
  const styles = useStyles();
  const maxAmount = Math.max(leftAmount, rightAmount);
  const hasData = maxAmount > 0;

  const leftBarHeight = hasData
    ? Math.max(8, (leftAmount / maxAmount) * MAX_BAR_HEIGHT)
    : MAX_BAR_HEIGHT * 0.5;
  const rightBarHeight = hasData
    ? Math.max(8, (rightAmount / maxAmount) * MAX_BAR_HEIGHT)
    : MAX_BAR_HEIGHT * 0.5;

  const deltaChipStyle =
    isDeltaPositive === true
      ? styles.deltaChipSuccess
      : isDeltaPositive === false
        ? styles.deltaChipDanger
        : null;

  const deltaTextStyle =
    isDeltaPositive === true
      ? styles.deltaTextSuccess
      : isDeltaPositive === false
        ? styles.deltaTextDanger
        : null;

  const summaryText =
    isDeltaPositive === true
      ? "You spent less. Net flow also improved."
      : isDeltaPositive === false
        ? "You spent more this period."
        : null;

  return (
    <InsightsCard kicker="SPENDING COMPARISON">
      <View style={styles.body}>
        <View style={styles.barsContainer}>
          <View style={styles.barGroup}>
            <Text style={styles.barLabel} numberOfLines={1}>
              {leftLabel.toUpperCase()}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barLeft,
                  {
                    height: leftBarHeight,
                    marginTop: MAX_BAR_HEIGHT - leftBarHeight,
                  },
                ]}
              />
            </View>
            <Text style={styles.barAmount}>{formatAmount(leftAmount)}</Text>
          </View>

          <View style={styles.barGroup}>
            <Text style={styles.barLabel} numberOfLines={1}>
              {rightLabel.toUpperCase()}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barRight,
                  {
                    height: rightBarHeight,
                    marginTop: MAX_BAR_HEIGHT - rightBarHeight,
                  },
                ]}
              />
            </View>
            <Text style={styles.barAmount}>{formatAmount(rightAmount)}</Text>
          </View>
        </View>

        {spentDelta !== null &&
          deltaChipStyle !== null &&
          deltaTextStyle !== null && (
            <View style={[styles.deltaChip, deltaChipStyle]}>
              <Text style={[styles.deltaText, deltaTextStyle]}>
                {spentDelta}
              </Text>
            </View>
          )}

        {summaryText !== null && (
          <Text style={styles.summaryText}>{summaryText}</Text>
        )}
      </View>
    </InsightsCard>
  );
});

const useStyles = createThemedStyles(({ colors }) => ({
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  barsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    marginBottom: spacing.md,
  },
  barGroup: {
    alignItems: "center",
    gap: spacing.xs,
    minWidth: 64,
  },
  barLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  barTrack: {
    height: MAX_BAR_HEIGHT,
    justifyContent: "flex-end",
  },
  barLeft: {
    width: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.skeleton.onSurface,
  },
  barRight: {
    width: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  barAmount: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
  },
  deltaChip: {
    alignSelf: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  deltaChipSuccess: {
    backgroundColor: colors.successTint,
  },
  deltaChipDanger: {
    backgroundColor: colors.dangerTint,
  },
  deltaText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  deltaTextSuccess: {
    color: colors.success,
  },
  deltaTextDanger: {
    color: colors.danger,
  },
  summaryText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.inkFaint,
    textAlign: "center",
  },
}));
