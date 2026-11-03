import { ChevronLeft, ChevronRight, Edit3 } from "lucide-react-native";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { SpendSplitBar } from "@/components/shared";
import { Button } from "@/components/ui";
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

function hasSplit(summary: BudgetMonthBentoSummary | null): boolean {
  return (summary?.fixedSpent ?? 0) > 0;
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
  const usagePercentUsed = summary?.usagePercentUsed ?? 0;
  const setBudgetTitle = suggestedBudget
    ? `Set ${formatInrCompact(suggestedBudget)} as your monthly budget`
    : "Set monthly budget";

  const isWatching = usagePercentUsed > 80 && usagePercentUsed < 100;
  const upcomingRecurring = summary?.upcomingRecurring ?? 0;

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

          <View style={styles.barWrap}>
            <SpendSplitBar
              budget={summary?.budgetValue ?? 0}
              fixed={summary?.fixedSpent ?? 0}
              flexible={summary?.flexibleSpent ?? 0}
              committed={upcomingRecurring}
            />
          </View>

          {/* The bar's breakdown has the amounts; this nudge is the only part it does not say. */}
          {isWatching ? (
            <Text style={styles.watchNote}>{`${usagePercentUsed}% — watch it`}</Text>
          ) : null}
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
              (hasSplit(summary) || upcomingRecurring > 0) &&
                styles.noBudgetSubTight,
            ]}
          >
            spent so far · no budget set
          </Text>
          {hasSplit(summary) || upcomingRecurring > 0 ? (
            <View style={styles.splitCentered}>
              <SpendSplitBar
                fixed={summary?.fixedSpent ?? 0}
                flexible={summary?.flexibleSpent ?? 0}
                committed={upcomingRecurring}
                centered
              />
            </View>
          ) : null}
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
  barWrap: {
    marginBottom: spacing.sm,
  },
  watchNote: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.warning,
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
  splitCentered: {
    marginBottom: spacing.lg,
  },
}));
