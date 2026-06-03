import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  BentoStatCell,
  MonthSummaryCardShell,
  MonthSummaryHeaderError,
  MonthSummaryHeaderKicker,
  MonthSummaryHeaderTitle,
  MonthSummarySectionDivider,
  MonthSummaryStatDivider,
  MonthSummaryStatsRow,
  MonthSummaryUnavailableText,
  netTone,
  type BentoStatCellTone,
} from "@/components/shared";
import { bento, colors, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import type { MonthOption } from "@/utils/buildMonthOptions";

export type InsightsMonthSummary = {
  transactionCount: number;
  hasMonthlyBudget: boolean;
  isOverBudget: boolean;
  budgetDisplay: string;
  usedPctDisplay: string;
  remainingValue: number;
  remainingLabel: string;
  remainingDisplay: string;
  spentDisplay: string;
  incomeDisplay: string;
  netDisplay: string;
  netValue: number;
};

export type InsightsMonthSummaryCardProps = {
  selectedMonth: string;
  monthOptions: MonthOption[];
  onSelectMonth: (index: number) => void;
  onMonthMenuOpenChange?: (open: boolean) => void;
  summary: InsightsMonthSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
};

function transactionCountLabel(count: number): string {
  return count === 1 ? "1 transaction" : `${count} transactions`;
}

export const InsightsMonthSummaryCard = memo(function InsightsMonthSummaryCard({
  selectedMonth,
  monthOptions,
  onSelectMonth,
  onMonthMenuOpenChange,
  summary,
  summaryLoading,
  summaryFailed,
}: InsightsMonthSummaryCardProps) {
  const remainingTone: BentoStatCellTone = summary?.isOverBudget
    ? "debit"
    : summary && summary.remainingValue > 0
      ? "credit"
      : "neutral";

  return (
    <MonthSummaryCardShell
      selectedMonth={selectedMonth}
      monthOptions={monthOptions}
      onSelectMonth={onSelectMonth}
      onMonthMenuOpenChange={onMonthMenuOpenChange}
      bodyKicker="Budget"
      headerContent={
        summaryFailed ? (
          <MonthSummaryHeaderError>
            Could not load summary
          </MonthSummaryHeaderError>
        ) : summaryLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : summary ? (
          <>
            <MonthSummaryHeaderKicker>This month</MonthSummaryHeaderKicker>
            <MonthSummaryHeaderTitle>
              {transactionCountLabel(summary.transactionCount)}
            </MonthSummaryHeaderTitle>
          </>
        ) : null
      }
    >
      {summaryFailed ? (
        <MonthSummaryUnavailableText />
      ) : summaryLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : summary ? (
        <View style={styles.bodySections}>
          <MonthSummaryStatsRow>
            <BentoStatCell label="Budget" value={summary.budgetDisplay} />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Used"
              value={summary.usedPctDisplay}
              tone={summary.isOverBudget ? "debit" : "neutral"}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label={summary.remainingLabel}
              value={summary.remainingDisplay}
              tone={remainingTone}
            />
          </MonthSummaryStatsRow>

          <MonthSummarySectionDivider />

          <View style={styles.cashFlowSection}>
            <Text style={styles.cashFlowKicker}>Cash flow</Text>
            <MonthSummaryStatsRow>
              <BentoStatCell
                label="Spent"
                value={summary.spentDisplay}
                tone="debit"
              />
              <MonthSummaryStatDivider />
              <BentoStatCell
                label="Income"
                value={summary.incomeDisplay}
                tone="credit"
              />
              <MonthSummaryStatDivider />
              <BentoStatCell
                label="Net"
                value={summary.netDisplay}
                tone={netTone(summary.netValue)}
              />
            </MonthSummaryStatsRow>
          </View>
        </View>
      ) : null}
    </MonthSummaryCardShell>
  );
});

const styles = StyleSheet.create({
  loading: {
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  bodySections: {
    gap: spacing.md,
  },
  cashFlowSection: {
    gap: spacing.sm,
  },
  cashFlowKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 10,
    lineHeight: 14,
    color: bento.onPastel.muted,
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
});
