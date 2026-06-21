import { ScrollView, StyleSheet } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { paper, spacing } from "@/constants";
import { TransactionCalendarCard } from "@/features/transactions/components/TransactionCalendarCard";
import { TransactionDayListCard } from "@/features/transactions/components/TransactionDayListCard";

import { useTransactionsScreenModel } from "./useTransactionsScreenModel";

export default function TransactionsScreen() {
  const {
    canGoPrevMonth,
    canGoNextMonth,
    dayExpenseTotal,
    dayIncomeTotal,
    dayNetTotal,
    dayTransactions,
    emptyVariant,
    goPrevMonth,
    goNextMonth,
    openTransactionDetail,
    onManualAdd,
    selectDay,
    selectedDayKey,
    selectedDayTransactionCount,
    selectedMonth,
    showMonthLoading,
    spendByDay,
  } = useTransactionsScreenModel();

  const isDayLoading =
    emptyVariant === "month-loading" || emptyVariant === "day-loading";
  const isFetching = emptyVariant === "day-loading";

  return (
    <TabScreenShell>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
      >
        <TransactionCalendarCard
          year={selectedMonth.year}
          monthIndex0={selectedMonth.monthIndex0}
          spendByDay={spendByDay}
          selectedDayKey={selectedDayKey}
          onSelectDay={selectDay}
          onPrevMonth={goPrevMonth}
          onNextMonth={goNextMonth}
          canGoPrevMonth={canGoPrevMonth}
          canGoNextMonth={canGoNextMonth}
          isLoading={showMonthLoading}
        />

        <TransactionDayListCard
          dayKey={selectedDayKey}
          transactions={dayTransactions}
          dayNetTotal={dayNetTotal}
          dayIncomeTotal={dayIncomeTotal}
          dayExpenseTotal={dayExpenseTotal}
          transactionCount={selectedDayTransactionCount}
          isLoading={isDayLoading}
          isFetching={isFetching}
          onTransactionPress={openTransactionDetail}
          onManualAdd={onManualAdd}
        />
      </ScrollView>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: paper,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
});
