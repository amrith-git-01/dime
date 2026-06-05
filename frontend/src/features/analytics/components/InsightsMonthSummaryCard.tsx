import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

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
import { SkeletonStrip } from "@/components/ui";
import { bento, spacing } from "@/constants";
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
  if (count <= 0) {
    return "\u2014";
  }
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
  const remainingLabel =
    summaryLoading || !summary?.isOverBudget
      ? "Remaining"
      : summary.remainingLabel;

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
        ) : (
          <>
            <MonthSummaryHeaderKicker>This month</MonthSummaryHeaderKicker>
            {summaryLoading ? (
              <SkeletonStrip
                variant="statValue"
                style={styles.headerTitleSkeleton}
              />
            ) : (
              <MonthSummaryHeaderTitle>
                {transactionCountLabel(summary?.transactionCount ?? 0)}
              </MonthSummaryHeaderTitle>
            )}
          </>
        )
      }
    >
      {summaryFailed ? (
        <MonthSummaryUnavailableText />
      ) : (
        <View style={styles.bodySections}>
          <MonthSummaryStatsRow>
            <BentoStatCell
              label="Budget"
              value={summary?.budgetDisplay ?? "—"}
              isValueLoading={summaryLoading}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Used"
              value={summary?.usedPctDisplay ?? "—"}
              tone={summary?.isOverBudget ? "debit" : "neutral"}
              isValueLoading={summaryLoading}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label={remainingLabel}
              value={summary?.remainingDisplay ?? "—"}
              tone={remainingTone}
              isValueLoading={summaryLoading}
            />
          </MonthSummaryStatsRow>

          <MonthSummarySectionDivider />

          <View style={styles.cashFlowSection}>
            <Text style={styles.cashFlowKicker}>Cash flow</Text>
            <MonthSummaryStatsRow>
              <BentoStatCell
                label="Spent"
                value={summary?.spentDisplay ?? "—"}
                tone="debit"
                isValueLoading={summaryLoading}
              />
              <MonthSummaryStatDivider />
              <BentoStatCell
                label="Income"
                value={summary?.incomeDisplay ?? "—"}
                tone="credit"
                isValueLoading={summaryLoading}
              />
              <MonthSummaryStatDivider />
              <BentoStatCell
                label="Net"
                value={summary?.netDisplay ?? "—"}
                tone={summary ? netTone(summary.netValue) : "neutral"}
                isValueLoading={summaryLoading}
              />
            </MonthSummaryStatsRow>
          </View>
        </View>
      )}
    </MonthSummaryCardShell>
  );
});

const styles = StyleSheet.create({
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
  headerTitleSkeleton: {
    width: "50%",
    marginTop: 2,
  },
});
