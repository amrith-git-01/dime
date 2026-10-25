import { ChevronLeft, ChevronRight, Edit3 } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Button, ProgressBar } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import { formatInrCompact } from "@/utils/currency";

import { BudgetSummaryBodySkeleton } from "./BudgetSummaryBodySkeleton";
import type { BudgetMonthBentoSummary } from "./bento/BudgetMonthBentoSummary";
import { createThemedStyles, useTheme } from "@/theme";

export type { BudgetMonthBentoSummary } from "./bento/BudgetMonthBentoSummary";

type BudgetSummaryCardProps = {
  selectedMonth: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  hasMonthlyBudget: boolean;
  summary: BudgetMonthBentoSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  onEditBudget: () => void;
  onSetBudget: () => void;
  spentValue?: number;
  /** Amount from the goal step of profile setup; offered in the set-budget button while no budget is set. */
  suggestedBudget?: number;
};

/** "Recurring ₹X · Flexible ₹Y" plus "₹Z recurring still to come", under the month's totals. */
function SplitLines({
  summary,
  centered = false,
}: {
  summary: BudgetMonthBentoSummary | null;
  centered?: boolean;
}) {
  const styles = useStyles();
  if (!summary?.splitLine && !summary?.upcomingLine) {
    return null;
  }
  return (
    <View style={centered ? styles.splitCentered : styles.split}>
      {summary.splitLine ? (
        <Text style={[styles.splitText, centered && styles.splitTextCentered]}>
          {summary.splitLine}
        </Text>
      ) : null}
      {summary.upcomingLine ? (
        <Text style={[styles.splitText, centered && styles.splitTextCentered]}>
          {summary.upcomingLine}
        </Text>
      ) : null}
    </View>
  );
}

export const BudgetSummaryCard = memo(function BudgetSummaryCard({
  selectedMonth,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
  hasMonthlyBudget,
  summary,
  summaryLoading,
  summaryFailed,
  onEditBudget,
  onSetBudget,
  spentValue = 0,
  suggestedBudget,
}: BudgetSummaryCardProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const isOverBudget = summary?.isOverBudget ?? false;
  const heroColor = isOverBudget ? colors.danger : colors.accentText;
  const usagePct = summary?.usagePct ?? 0;
  const usagePercentUsed = summary?.usagePercentUsed ?? 0;
  const setBudgetTitle = suggestedBudget
    ? `Set ${formatInrCompact(suggestedBudget)} as your monthly budget`
    : "Set monthly budget";

  const pillBg = isOverBudget
    ? colors.dangerTint
    : usagePercentUsed > 80 && usagePercentUsed < 100
      ? colors.warningTint
      : colors.line;
  const pillTextColor = isOverBudget
    ? colors.danger
    : usagePercentUsed > 80 && usagePercentUsed < 100
      ? colors.warning
      : colors.inkSoft;
  const pillText = isOverBudget
    ? `${usagePercentUsed}% — over budget`
    : usagePercentUsed > 80 && usagePercentUsed < 100
      ? `${usagePercentUsed}% — watch it`
      : `${usagePercentUsed}% used`;

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={onPrevMonth}
          disabled={!canGoPrevMonth}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
        >
          <ChevronLeft
            size={20}
            color={canGoPrevMonth ? colors.inkSoft : colors.inkFaint}
            strokeWidth={2}
          />
        </Pressable>
        <Text style={styles.monthLabel}>{selectedMonth}</Text>
        <Pressable
          onPress={onNextMonth}
          disabled={!canGoNextMonth}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Next month"
        >
          <ChevronRight
            size={20}
            color={canGoNextMonth ? colors.inkSoft : colors.inkFaint}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      {summaryFailed ? (
        <Text style={styles.errorText}>
          Could not load spending for this month.
        </Text>
      ) : summaryLoading ? (
        <BudgetSummaryBodySkeleton />
      ) : hasMonthlyBudget ? (
        /* ── STATE A: Budget set ─────────────────── */
        <>
          {/* Kicker + edit row */}
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>MONTHLY REMAINING</Text>
            <Pressable
              onPress={onEditBudget}
              style={styles.editBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit budget"
            >
              <Edit3 size={16} color={colors.accentText} strokeWidth={2} />
            </Pressable>
          </View>

          <Text style={[styles.heroAmount, { color: heroColor }]}>
            {isOverBudget
              ? `${summary?.overageDisplay ?? "—"} over`
              : (summary?.remainingDisplay ?? "—")}
          </Text>

          <View style={styles.progressWrap}>
            <ProgressBar
              progress={usagePct}
              fillColor={isOverBudget ? colors.danger : colors.accent}
              backgroundColor={colors.line}
              height={8}
            />
          </View>

          <View style={[styles.pill, { backgroundColor: pillBg }]}>
            <Text style={[styles.pillText, { color: pillTextColor }]}>
              {pillText}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Budget</Text>
              <Text style={styles.statValue}>
                {summary?.budgetDisplay ?? "—"}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Spent</Text>
              <Text style={styles.statValue}>
                {summary?.spentDisplay ?? "—"}
              </Text>
            </View>
          </View>
          <SplitLines summary={summary} />
        </>
      ) : (
        /* ── STATE B: No budget set ─────────────── */
        <>
          <Text style={styles.kickerNoBudget}>
            {`THIS MONTH — ${selectedMonth.toUpperCase()}`}
          </Text>
          <Text style={styles.noBudgetAmount}>
            {formatInrCompact(spentValue)}
          </Text>
          <Text
            style={[
              styles.noBudgetSub,
              (summary?.splitLine || summary?.upcomingLine) &&
                styles.noBudgetSubTight,
            ]}
          >
            spent so far · no budget set
          </Text>
          <SplitLines summary={summary} centered />
          <Button
            title={setBudgetTitle}
            onPress={onSetBudget}
            accessibilityLabel={setBudgetTitle}
          />
        </>
      )}
    </View>
  );
});

const useStyles = createThemedStyles(({ colors, shadows }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    marginHorizontal: spacing.lg,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  editBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  kicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  heroAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 36,
    lineHeight: 44,
    fontVariant: ["tabular-nums"],
    marginBottom: spacing.md,
  },
  progressWrap: {
    marginBottom: spacing.sm,
  },
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  pillText: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.line,
    marginHorizontal: spacing.md,
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
  },
  statValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  kickerNoBudget: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  noBudgetAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  noBudgetSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  noBudgetSubTight: {
    marginBottom: spacing.xs,
  },
  split: {
    marginTop: spacing.md,
    gap: 2,
  },
  splitCentered: {
    marginBottom: spacing.lg,
    gap: 2,
  },
  splitText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  splitTextCentered: {
    textAlign: "center",
  },
}));
