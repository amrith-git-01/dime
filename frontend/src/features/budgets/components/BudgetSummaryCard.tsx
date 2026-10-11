import { ChevronLeft, ChevronRight, Edit3 } from "lucide-react-native";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ProgressBar } from "@/components/ui";
import {
  accent,
  danger,
  dangerTint,
  ink,
  inkFaint,
  inkSoft,
  line,
  surface,
  warning,
  warningTint,
} from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import { formatInrCompact } from "@/utils/currency";

import { BudgetSummaryBodySkeleton } from "./BudgetSummaryBodySkeleton";
import type { BudgetMonthBentoSummary } from "./bento/BudgetMonthBentoCard";

export type { BudgetMonthBentoSummary } from "./bento/BudgetMonthBentoCard";

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
};

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
}: BudgetSummaryCardProps) {
  const isOverBudget = summary?.isOverBudget ?? false;
  const heroColor = isOverBudget ? danger : accent;
  const usagePct = summary?.usagePct ?? 0;
  const usagePercentUsed = summary?.usagePercentUsed ?? 0;

  const pillBg = isOverBudget
    ? dangerTint
    : usagePercentUsed > 80 && usagePercentUsed < 100
      ? warningTint
      : line;
  const pillTextColor = isOverBudget
    ? danger
    : usagePercentUsed > 80 && usagePercentUsed < 100
      ? warning
      : inkSoft;
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
            color={canGoPrevMonth ? inkSoft : inkFaint}
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
            color={canGoNextMonth ? inkSoft : inkFaint}
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
              <Edit3 size={16} color={accent} strokeWidth={2} />
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
              fillColor={isOverBudget ? danger : accent}
              backgroundColor={line}
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
          <Text style={styles.noBudgetSub}>spent so far · no budget set</Text>
          <Pressable
            onPress={onSetBudget}
            style={({ pressed }) => [
              styles.setBtn,
              pressed && styles.setBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Set monthly budget"
          >
            <Text style={styles.setBtnText}>Set monthly budget</Text>
          </Pressable>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
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
    color: ink,
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
    color: inkSoft,
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
    backgroundColor: line,
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
    backgroundColor: line,
    marginHorizontal: spacing.md,
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  statValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: ink,
    fontVariant: ["tabular-nums"],
  },
  errorText: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  kickerNoBudget: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 14,
    color: inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  noBudgetAmount: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 32,
    lineHeight: 40,
    color: ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  noBudgetSub: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  setBtn: {
    backgroundColor: accent,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: "center",
  },
  setBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  setBtnText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: surface,
  },
});
