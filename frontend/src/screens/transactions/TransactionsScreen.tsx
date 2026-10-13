import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { CARD_SEGMENT_SHADOW_TOP_BLEED } from "@/components/shared";
import { spacing } from "@/constants";
import {
  TransactionCalendarCard,
  TransactionDayCardFooter,
  TransactionDayCardHeader,
  TransactionDayCardPlaceholder,
  TransactionDayCardRow,
} from "@/features/transactions/components";
import type { TransactionFlashListItem } from "@/features/transactions/utils/buildTransactionFlashListData";

import { useTransactionsScreenModel } from "./useTransactionsScreenModel";
import { createThemedStyles } from "@/theme";

const NO_ROWS: TransactionFlashListItem[] = [];

function keyExtractor(item: TransactionFlashListItem): string {
  return item.id;
}

export default function TransactionsScreen() {
  const styles = useStyles();
  const {
    canGoPrevMonth,
    canGoNextMonth,
    dayExpenseTotal,
    dayIncomeTotal,
    dayNetTotal,
    emptyVariant,
    flashListData,
    goPrevMonth,
    goNextMonth,
    openTransactionDetail,
    onManualAddForDay,
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
  const hasActivity = selectedDayTransactionCount > 0;
  // Rows are only shown once the day is known to have activity (matches the summary count).
  const visibleRows = isDayLoading || !hasActivity ? NO_ROWS : flashListData;

  const renderItem: ListRenderItem<TransactionFlashListItem> = ({ item }) => (
    <TransactionDayCardRow
      transaction={item.transaction}
      showDivider={item.sectionRowIndex > 0}
      onPress={openTransactionDetail}
    />
  );

  return (
    <TabScreenShell>
      <FlashList
        style={styles.list}
        data={visibleRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
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
            <TransactionDayCardHeader
              dayKey={selectedDayKey}
              dayNetTotal={dayNetTotal}
              hasActivity={hasActivity}
              isFetching={isFetching}
              onAdd={onManualAddForDay}
            />
          </View>
        }
        ListEmptyComponent={
          isDayLoading || !hasActivity ? (
            <TransactionDayCardPlaceholder
              dayKey={selectedDayKey}
              isLoading={isDayLoading}
              onManualAdd={onManualAddForDay}
            />
          ) : null
        }
        ListFooterComponent={
          hasActivity && !isDayLoading ? (
            <TransactionDayCardFooter
              transactionCount={selectedDayTransactionCount}
              dayIncomeTotal={dayIncomeTotal}
              dayExpenseTotal={dayExpenseTotal}
            />
          ) : null
        }
      />
    </TabScreenShell>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  list: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    // The day-card header segment reserves top room for its card shadow.
    gap: spacing.md - CARD_SEGMENT_SHADOW_TOP_BLEED,
  },
}));
