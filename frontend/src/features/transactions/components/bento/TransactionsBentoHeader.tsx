import { memo } from "react";
import { StyleSheet, View } from "react-native";

import { BENTO_SECTION_GAP } from "@/components/bento";
import type { MonthOption } from "@/utils/buildMonthOptions";

import { TransactionsDayBar } from "./TransactionsDayBar";
import {
  TransactionsMonthBentoCard,
  type TransactionsMonthBentoSummary,
} from "./TransactionsMonthBentoCard";

export type TransactionsBentoHeaderProps = {
  selectedMonthLabel: string;
  summary: TransactionsMonthBentoSummary | null;
  summaryLoading: boolean;
  summaryFailed: boolean;
  monthOptions: MonthOption[];
  onSelectMonth: (index: number) => void;
  selectedDayKey: string;
  transactionCount: number;
  canGoPrevDay: boolean;
  canGoNextDay: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onMonthMenuOpenChange?: (open: boolean) => void;
  /** Full day-bar placeholder (initial month load). */
  dayBarLoading?: boolean;
  /** Skeleton only on transaction count (day pagination). */
  dayBarCountLoading?: boolean;
};

export const TransactionsBentoHeader = memo(function TransactionsBentoHeader({
  selectedMonthLabel,
  summary,
  summaryLoading,
  summaryFailed,
  monthOptions,
  onSelectMonth,
  selectedDayKey,
  transactionCount,
  canGoPrevDay,
  canGoNextDay,
  onPrevDay,
  onNextDay,
  onMonthMenuOpenChange,
  dayBarLoading = false,
  dayBarCountLoading = false,
}: TransactionsBentoHeaderProps) {
  return (
    <View style={styles.root}>
      <TransactionsMonthBentoCard
        selectedMonth={selectedMonthLabel}
        summary={summary}
        summaryLoading={summaryLoading}
        summaryFailed={summaryFailed}
        onSelectMonth={onSelectMonth}
        monthOptions={monthOptions}
        onMonthMenuOpenChange={onMonthMenuOpenChange}
      />
      <View style={styles.dayBarGap}>
        <TransactionsDayBar
          dayKey={selectedDayKey}
          transactionCount={transactionCount}
          canGoPrev={canGoPrevDay}
          canGoNext={canGoNextDay}
          onPrev={onPrevDay}
          onNext={onNextDay}
          isLoading={dayBarLoading}
          isCountLoading={dayBarCountLoading}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    gap: BENTO_SECTION_GAP,
  },
  dayBarGap: {
    marginBottom: BENTO_SECTION_GAP,
  },
});
