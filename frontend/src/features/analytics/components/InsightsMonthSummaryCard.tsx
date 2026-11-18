import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SpendSplitBar } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme, type ThemeColors } from "@/theme";

export type InsightsMonthSummary = {
  transactionCount: number;
  hasMonthlyBudget: boolean;
  hasIncome: boolean;
  isOverBudget: boolean;
  budgetDisplay: string;
  /** Monthly budget in rupees; 0 when none is set. */
  budgetValue: number;
  usedPctDisplay: string;
  remainingValue: number;
  remainingLabel: string;
  remainingDisplay: string;
  spentDisplay: string;
  incomeDisplay: string;
  netDisplay: string;
  netValue: number;
  /** Budget left, SIGNED (negative = over), the server's figure; null without a budget. */
  budgetLeft: number | null;
  savingsRatePct: number | null;
  /** Some of the month's spend is fixed (recurring categories). */
  hasFixed: boolean;
  fixedDisplay: string;
  flexibleDisplay: string;
  /** Fixed / flexible spend in rupees, for the split bar. */
  fixedValue: number;
  flexibleValue: number;
  /** Fixed income still to come this month; null when none (or a closed month). */
  expectedIncomeDisplay: string | null;
};

export type InsightsMonthSummaryCardProps = {
  summary: InsightsMonthSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  hasMonthlyBudget?: boolean;
};

/** Net is the secondary number: green when money came in ahead of what went out, red when it did not. */
function netColor(summary: InsightsMonthSummary | null, colors: ThemeColors): string {
  if (!summary) return colors.ink;
  if (summary.netValue > 0) return colors.success;
  if (summary.netValue < 0) return colors.danger;
  return colors.ink;
}
function buildSubtitle(summary: InsightsMonthSummary): string {
  const parts: string[] = [];
  if (summary.hasIncome && summary.savingsRatePct !== null) {
    parts.push(`${summary.savingsRatePct}% saved`);
  }
  parts.push(
    summary.transactionCount === 1
      ? "1 transaction"
      : `${summary.transactionCount} transactions`,
  );
  return parts.join(" · ");
}

export const InsightsMonthSummaryCard = memo(function InsightsMonthSummaryCard({
  summary,
  summaryLoading,
  summaryFailed,
  hasMonthlyBudget,
}: InsightsMonthSummaryCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const heroCol = colors.accentText;
  const subtitle = summary ? buildSubtitle(summary) : "";
  const showBudgetBar = Boolean(hasMonthlyBudget ?? summary?.hasMonthlyBudget);
  const hasIncome = Boolean(summary?.hasIncome);

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>THIS MONTH</Text>
      </View>

      {/* Hero amount */}
      <View style={styles.heroSection}>
        {summaryFailed ? (
          <Text style={styles.errorText}>Could not load</Text>
        ) : summaryLoading ? (
          <>
            <SkeletonBlock style={styles.heroSkeleton} />
            <SkeletonBlock style={styles.subtitleSkeleton} />
          </>
        ) : (
          <>
            <Text style={[styles.heroAmount, { color: heroCol }]}>
              {summary?.spentDisplay ?? "₹\u202F0"}
            </Text>
            <Text style={styles.heroSuffix}>spent</Text>
            {subtitle.length > 0 ? (
              <Text style={styles.heroSubtitle}>{subtitle}</Text>
            ) : null}
          </>
        )}
      </View>

      {/* Stats row: the headline above is what was spent; income and net sit beside it */}
      {hasIncome || summaryLoading ? (
        <>
          <View style={styles.divider} />
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Income</Text>
              {summaryLoading ? (
                <SkeletonBlock style={styles.statSkeleton} />
              ) : (
                <Text style={[styles.statValue, styles.incomeValue]}>
                  {summary?.incomeDisplay ?? "—"}
                </Text>
              )}
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Net</Text>
              {summaryLoading ? (
                <SkeletonBlock style={styles.statSkeleton} />
              ) : (
                <Text style={[styles.statValue, { color: netColor(summary, colors) }]}>
                  {summary?.netDisplay ?? "—"}
                </Text>
              )}
            </View>
          </View>
        </>
      ) : null}

      {/* Recurring / flexible / left breakdown (inside the budget when there is one) + what is still expected */}
      {summary &&
      !summaryLoading &&
      (summary.hasFixed || showBudgetBar || summary.expectedIncomeDisplay) ? (
        <>
          <View style={styles.divider} />
          <View style={styles.splitSection}>
            {summary.hasFixed || showBudgetBar ? (
              <SpendSplitBar
                fixed={summary.fixedValue}
                flexible={summary.flexibleValue}
                budget={showBudgetBar ? summary.budgetValue : 0}
                left={showBudgetBar ? summary.budgetLeft : null}
              />
            ) : null}
            {summary.expectedIncomeDisplay ? (
              <Text style={styles.splitText}>
                {`Expected income ${summary.expectedIncomeDisplay}`}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.card,
    overflow: "hidden",
  },
  headerRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  kicker: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  heroSection: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
    minHeight: 72,
    justifyContent: "center",
  },
  heroAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 40,
    lineHeight: 48,
    fontVariant: ["tabular-nums"],
  },
  heroSuffix: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  heroSubtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
  },
  heroSkeleton: {
    width: 160,
    height: 44,
    borderRadius: radius.sm,
  },
  subtitleSkeleton: {
    width: 120,
    height: 16,
    borderRadius: radius.sm,
  },
  errorText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.danger,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    alignSelf: "stretch",
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
  },
  statValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  incomeValue: {
    color: colors.success,
  },
  statSkeleton: {
    width: 60,
    height: 18,
    borderRadius: radius.sm,
  },
  splitSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  splitText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
}));
