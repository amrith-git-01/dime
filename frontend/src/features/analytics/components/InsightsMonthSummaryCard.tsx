import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProgressBar, SkeletonBlock } from "@/components/ui";
import { radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { createThemedStyles, useTheme, type ThemeColors } from "@/theme";

export type InsightsMonthSummary = {
  transactionCount: number;
  hasMonthlyBudget: boolean;
  hasIncome: boolean;
  isOverBudget: boolean;
  budgetDisplay: string;
  usedPctDisplay: string;
  remainingValue: number;
  remainingLabel: string;
  remainingDisplay: string;
  spentDisplay: string;
  incomeDisplay: string;
  netDisplay: string;
  /** Net when income exists; otherwise spend (unsigned). */
  heroDisplay: string;
  netValue: number;
  savingsRatePct: number | null;
  /** Some of the month's spend is fixed (recurring categories). */
  hasFixed: boolean;
  fixedDisplay: string;
  flexibleDisplay: string;
  /** Fixed income still to come this month; null when none (or a closed month). */
  expectedIncomeDisplay: string | null;
  /** Credited + expected income - projected spend; null when it cannot be told. */
  projectedNetDisplay: string | null;
  projectedNetValue: number;
};

export type InsightsMonthSummaryCardProps = {
  selectedMonth: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  summary: InsightsMonthSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  hasMonthlyBudget?: boolean;
};

function heroColor(
  summary: InsightsMonthSummary | null,
  loading: boolean,
  colors: ThemeColors,
): string {
  if (loading || !summary || !summary.hasIncome) return colors.accentText;
  if (summary.netValue > 0) return colors.success;
  if (summary.netValue < 0) return colors.danger;
  return colors.accentText;
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

function budgetUsedProgress(summary: InsightsMonthSummary): number {
  if (!summary.hasMonthlyBudget || !summary.budgetDisplay) return 0;
  const used = summary.usedPctDisplay.replace("%", "");
  const pct = Number.parseInt(used, 10);
  return Number.isFinite(pct) ? Math.min(pct / 100, 1) : 0;
}

export const InsightsMonthSummaryCard = memo(function InsightsMonthSummaryCard({
  selectedMonth,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
  summary,
  summaryLoading,
  summaryFailed,
  hasMonthlyBudget,
}: InsightsMonthSummaryCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const heroCol = heroColor(summary, summaryLoading, colors);
  const subtitle = summary ? buildSubtitle(summary) : "";
  const showBudgetBar = Boolean(hasMonthlyBudget ?? summary?.hasMonthlyBudget);
  const budgetProgress = summary ? budgetUsedProgress(summary) : 0;
  const hasIncome = Boolean(summary?.hasIncome);

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>THIS MONTH</Text>
        <View style={styles.navRow}>
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
          <Text style={styles.monthLabel}>{selectedMonth}</Text>
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
              {summary?.heroDisplay ?? "₹\u202F0"}
            </Text>
            {subtitle.length > 0 ? (
              <Text style={styles.heroSubtitle}>{subtitle}</Text>
            ) : null}
          </>
        )}
      </View>

      {/* Stats row */}
      <View style={styles.divider} />
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Spent</Text>
          {summaryLoading ? (
            <SkeletonBlock style={styles.statSkeleton} />
          ) : (
            <Text style={styles.statValue}>
              {summary?.spentDisplay ?? "₹\u202F0"}
            </Text>
          )}
        </View>
        {hasIncome || summaryLoading ? (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statLabel}>Income</Text>
              {summaryLoading ? (
                <SkeletonBlock style={styles.statSkeleton} />
              ) : (
                <Text style={[styles.statValue, styles.incomeValue]}>
                  {summary?.incomeDisplay ?? "\u2014"}
                </Text>
              )}
            </View>
          </>
        ) : null}
      </View>

      {/* Fixed vs flexible split + what is still expected */}
      {summary && !summaryLoading && (summary.hasFixed || summary.expectedIncomeDisplay) ? (
        <>
          <View style={styles.divider} />
          <View style={styles.splitSection}>
            {summary.hasFixed ? (
              <View style={styles.splitRow}>
                <Text style={styles.splitText}>
                  {`Fixed ${summary.fixedDisplay} · Flexible ${summary.flexibleDisplay}`}
                </Text>
              </View>
            ) : null}
            {summary.expectedIncomeDisplay ? (
              <Text style={styles.splitText}>
                {`Expected income ${summary.expectedIncomeDisplay}`}
                {summary.projectedNetDisplay
                  ? ` · Projected net ${summary.projectedNetDisplay}`
                  : ""}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* Budget bar */}
      {showBudgetBar && summary ? (
        <>
          <View style={styles.divider} />
          <View style={styles.budgetSection}>
            <ProgressBar
              progress={budgetProgress}
              height={8}
              fillColor={summary.isOverBudget ? colors.danger : colors.accent}
              backgroundColor={colors.surfaceSunken}
            />
            <Text style={styles.budgetMeta}>
              {`Budget ${summary.budgetDisplay} · ${summary.remainingLabel} ${summary.remainingDisplay} · ${summary.usedPctDisplay} used`}
            </Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  navBtn: {
    padding: spacing.xs,
  },
  monthLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    minWidth: 72,
    textAlign: "center",
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
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  splitText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  budgetSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  budgetMeta: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkFaint,
  },
}));
