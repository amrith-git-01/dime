import { memo } from "react";
import { StyleSheet } from "react-native";

import {
  BentoStatCell,
  MonthSummaryCardShell,
  MonthSummaryHeaderError,
  MonthSummaryHeaderKicker,
  MonthSummaryHeaderTitle,
  MonthSummaryStatDivider,
  MonthSummaryStatsRow,
  MonthSummaryUnavailableText,
  netTone,
} from "@/components/shared";
import { SkeletonStrip } from "@/components/ui";
import type { MonthOption } from "@/utils/buildMonthOptions";

export type TransactionsMonthBentoSummary = {
  transactionCount: number;
  spentDisplay: string;
  creditedDisplay: string;
  debitedDisplay: string;
  netDisplay: string;
  netValue: number;
  /** Recurring spend still to come this month; null when there is none. */
  upcomingDisplay?: string | null;
};

export type TransactionsMonthBentoCardProps = {
  selectedMonth: string;
  summary: TransactionsMonthBentoSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  onSelectMonth: (index: number) => void;
  monthOptions: MonthOption[];
  onMonthMenuOpenChange?: (open: boolean) => void;
};

function transactionCountLabel(count: number): string {
  if (count <= 0) {
    return "\u2014";
  }
  return count === 1 ? "1 transaction" : `${count} transactions`;
}

export const TransactionsMonthBentoCard = memo(
  function TransactionsMonthBentoCard({
    selectedMonth,
    summary,
    summaryLoading,
    summaryFailed,
    onSelectMonth,
    monthOptions,
    onMonthMenuOpenChange,
  }: TransactionsMonthBentoCardProps) {
    return (
      <MonthSummaryCardShell
        selectedMonth={selectedMonth}
        monthOptions={monthOptions}
        onSelectMonth={onSelectMonth}
        onMonthMenuOpenChange={onMonthMenuOpenChange}
        bodyKicker="Cash flow"
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
          <MonthSummaryStatsRow>
            <BentoStatCell
              label="Credited"
              value={summary?.creditedDisplay ?? "—"}
              tone="credit"
              isValueLoading={summaryLoading}
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Debited"
              value={summary?.debitedDisplay ?? "—"}
              tone="debit"
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
        )}
        {!summaryFailed && !summaryLoading && summary?.upcomingDisplay ? (
          <MonthSummaryStatsRow>
            <BentoStatCell
              label="Upcoming"
              value={summary.upcomingDisplay}
              tone="neutral"
            />
          </MonthSummaryStatsRow>
        ) : null}
      </MonthSummaryCardShell>
    );
  },
);

const styles = StyleSheet.create({
  headerTitleSkeleton: {
    width: "50%",
    marginTop: 2,
  },
});
