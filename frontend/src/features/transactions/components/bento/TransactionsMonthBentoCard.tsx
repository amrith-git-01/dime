import { memo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

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
import { colors } from "@/constants";
import type { MonthOption } from "@/utils/buildMonthOptions";

export type TransactionsMonthBentoSummary = {
  transactionCount: number;
  spentDisplay: string;
  creditedDisplay: string;
  debitedDisplay: string;
  netDisplay: string;
  netValue: number;
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
          <View style={styles.cashFlowLoading}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : summary ? (
          <MonthSummaryStatsRow>
            <BentoStatCell
              label="Credited"
              value={summary.creditedDisplay}
              tone="credit"
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Debited"
              value={summary.debitedDisplay}
              tone="debit"
            />
            <MonthSummaryStatDivider />
            <BentoStatCell
              label="Net"
              value={summary.netDisplay}
              tone={netTone(summary.netValue)}
            />
          </MonthSummaryStatsRow>
        ) : null}
      </MonthSummaryCardShell>
    );
  },
);

const styles = StyleSheet.create({
  cashFlowLoading: {
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
});
