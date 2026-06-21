import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ProgressBar, SkeletonBlock } from "@/components/ui";
import {
  accent,
  danger,
  ink,
  inkSoft,
  line,
  radius,
  spacing,
  surfaceSunken,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  calendarDaysInMonth,
  isCurrentMonth,
  isPastMonth,
} from "@/features/analytics/utils/buildCashflowWindow";

import type { InsightsBurnRateMetrics } from "../utils/computeBurnRateMetrics";
import { InsightsCard } from "./InsightsCard";

export type InsightsBurnRateMetricCardProps = {
  metrics: InsightsBurnRateMetrics | null;
  loading?: boolean;
  year: number;
  monthIndex0: number;
};

export const InsightsBurnRateMetricCard = memo(
  function InsightsBurnRateMetricCard({
    metrics,
    loading = false,
    year,
    monthIndex0,
  }: InsightsBurnRateMetricCardProps) {
    const isCurrent = isCurrentMonth(year, monthIndex0);
    const isPast = isPastMonth(year, monthIndex0);

    const today = new Date();
    const daysInMonth = calendarDaysInMonth(year, monthIndex0);

    // For current month use today's day; for past months show full month; future = 0
    const dayOfMonth = isCurrent
      ? Math.min(today.getDate(), daysInMonth)
      : isPast
        ? daysInMonth
        : 0;
    const dayProgress = daysInMonth > 0 ? dayOfMonth / daysInMonth : 0;
    const dayPct = Math.round(dayProgress * 100);

    // "Day 21 of 30" / "Month complete" / "Month not started"
    const dayLabel = isCurrent
      ? `Day ${dayOfMonth} of ${daysInMonth}`
      : isPast
        ? "Month complete"
        : "Month not started";

    const budgetUsedPct =
      metrics?.hasMonthlyBudget &&
      metrics.monthlyBudget != null &&
      metrics.monthlyBudget > 0
        ? Math.round((metrics.spentSoFar / metrics.monthlyBudget) * 100)
        : null;

    const isOverPace = Boolean(!loading && metrics?.isOverPace);
    const budgetBarColor =
      budgetUsedPct != null && budgetUsedPct > 100 ? danger : accent;

    // Status line copy — past tense for closed months
    const statusLine = isOverPace
      ? isCurrent
        ? "Spending faster than your daily target"
        : "Spent faster than your daily target"
      : isCurrent
        ? "On track with your daily spending pace"
        : "Stayed within daily pace";

    return (
      <InsightsCard
        kicker="MONTHLY PACE"
        subtitle="How spend tracks against an even daily rate"
      >
        {/* Dual bars */}
        <View style={styles.barsSection}>
          {/* Day progress bar */}
          <View style={styles.barRow}>
            <View style={styles.barLabelRow}>
              <Text style={styles.barLabel}>{dayLabel}</Text>
              <Text style={styles.barPct}>{`${dayPct}%`}</Text>
            </View>
            <ProgressBar
              progress={dayProgress}
              height={4}
              fillColor={inkSoft}
              backgroundColor={surfaceSunken}
            />
          </View>

          {/* Budget used bar */}
          {metrics?.hasMonthlyBudget && budgetUsedPct !== null ? (
            <View style={styles.barRow}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>Budget used</Text>
                <Text
                  style={[
                    styles.barPct,
                    budgetUsedPct > 100 && styles.barPctDanger,
                  ]}
                >
                  {`${budgetUsedPct}%`}
                </Text>
              </View>
              <ProgressBar
                progress={Math.min(budgetUsedPct / 100, 1)}
                height={8}
                fillColor={budgetBarColor}
                backgroundColor={surfaceSunken}
              />
            </View>
          ) : null}

          {/* Status line */}
          {!loading && metrics ? (
            <Text
              style={[
                styles.statusLine,
                isOverPace ? styles.statusLineDanger : styles.statusLineNeutral,
              ]}
            >
              {statusLine}
            </Text>
          ) : null}
        </View>

        <View style={styles.divider} />

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>
              {metrics?.spentLabel ?? "Spent so far"}
            </Text>
            {loading ? (
              <SkeletonBlock style={styles.statSkeleton} />
            ) : (
              <Text
                style={[styles.statValue, isOverPace && styles.statValueDanger]}
              >
                {metrics?.spentDisplay ?? "\u2014"}
              </Text>
            )}
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statCell}>
            <Text style={styles.statLabel}>
              {metrics?.idealLabel ?? "Ideal by today"}
            </Text>
            {loading ? (
              <SkeletonBlock style={styles.statSkeleton} />
            ) : (
              <Text style={styles.statValue}>
                {metrics?.idealDisplay ?? "\u2014"}
              </Text>
            )}
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statCell}>
            <Text style={styles.statLabel}>
              {metrics?.projectedLabel ?? "At this pace"}
            </Text>
            {loading ? (
              <SkeletonBlock style={styles.statSkeleton} />
            ) : (
              <Text
                style={[
                  styles.statValue,
                  metrics?.hasMonthlyBudget &&
                    metrics.projected > (metrics.monthlyBudget ?? 0) &&
                    styles.statValueDanger,
                ]}
              >
                {metrics?.projectedDisplay ?? "\u2014"}
              </Text>
            )}
          </View>
        </View>
      </InsightsCard>
    );
  },
);

const styles = StyleSheet.create({
  barsSection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginHorizontal: spacing.lg,
  },
  barRow: {
    gap: spacing.xs,
  },
  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
  },
  barPct: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: inkSoft,
    fontVariant: ["tabular-nums"],
  },
  barPctDanger: {
    color: danger,
  },
  statusLine: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
  },
  statusLineNeutral: {
    color: inkSoft,
  },
  statusLineDanger: {
    color: danger,
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
    backgroundColor: line,
    alignSelf: "stretch",
  },
  statLabel: {
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 15,
    color: inkSoft,
    textAlign: "center",
  },
  statValue: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 20,
    color: ink,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
  statValueDanger: {
    color: danger,
  },
  statSkeleton: {
    width: 56,
    height: 18,
    borderRadius: radius.sm,
  },
});
