import {
  FlashList,
  type FlashListRef,
  type ListRenderItem,
} from "@shopify/flash-list";
import { useMemo, useRef } from "react";
import { View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { CARD_SEGMENT_SHADOW_TOP_BLEED } from "@/components/shared";
import { FLOATING_BUTTONS_CLEARANCE, spacing } from "@/constants";
import { tourTargetIds } from "@/constants/tourTargetIds";
import {
  TransactionCalendarCard,
  TransactionDayCardFooter,
  TransactionDayCardHeader,
  TransactionDayCardPlaceholder,
  TransactionDayCardRow,
  TransactionDayCardUpcomingRow,
} from "@/features/transactions/components";
import type { TransactionFlashListItem } from "@/features/transactions/utils/buildTransactionFlashListData";
import { useTourScroller } from "@/hooks/useTourScroller";

import { useTransactionsScreenModel } from "./useTransactionsScreenModel";
import { createThemedStyles } from "@/theme";

const NO_ROWS: TransactionFlashListItem[] = [];

function keyExtractor(item: TransactionFlashListItem): string {
  return item.id;
}

function getItemType(item: TransactionFlashListItem): string {
  return item.kind;
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
    today,
    upcomingDayKeys,
    upcomingDayTotal,
    upcomingExpenseTotal,
    openUpcomingOccurrence,
  } = useTransactionsScreenModel();

  const listRef = useRef<FlashListRef<TransactionFlashListItem>>(null);
  // Lets the guided tour scroll the list so each spotlighted part is in view.
  const { onScroll } = useTourScroller("transactions", (y, animated) =>
    listRef.current?.scrollToOffset({ offset: y, animated }),
  );

  const isDayLoading =
    emptyVariant === "month-loading" || emptyVariant === "day-loading";
  const isFetching = emptyVariant === "day-loading";
  const hasActivity = selectedDayTransactionCount > 0;
  // Real rows are only shown once the day is known to have activity (matches the summary count).
  // Upcoming ghost rows are not activity: they show on their own, and never feed the counts or totals.
  const ghostRows = useMemo(
    () => flashListData.filter((item) => item.kind === "upcoming"),
    [flashListData],
  );
  const hasGhosts = ghostRows.length > 0;
  const showEmptyDay = !isDayLoading && !hasActivity && !hasGhosts;
  const visibleRows = isDayLoading
    ? NO_ROWS
    : hasActivity
      ? flashListData
      : ghostRows;

  const renderItem: ListRenderItem<TransactionFlashListItem> = ({ item }) =>
    item.kind === "upcoming" ? (
      <TransactionDayCardUpcomingRow
        occurrence={item.occurrence}
        today={today}
        showDivider={item.sectionRowIndex > 0}
        onPress={openUpcomingOccurrence}
      />
    ) : (
      <TransactionDayCardRow
        transaction={item.transaction}
        showDivider={item.sectionRowIndex > 0}
        onPress={openTransactionDetail}
        tourTargetId={
          item.sectionRowIndex === 0
            ? tourTargetIds.transactionsFirstRow
            : undefined
        }
      />
    );

  return (
    <TabScreenShell>
      <FlashList
        ref={listRef}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={styles.list}
        data={visibleRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <TransactionCalendarCard
              year={selectedMonth.year}
              monthIndex0={selectedMonth.monthIndex0}
              spendByDay={spendByDay}
              upcomingDayKeys={upcomingDayKeys}
              upcomingTotal={upcomingExpenseTotal}
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
              // The empty-day message has its own "Add expense" button, so the header's is dropped then.
              onAdd={showEmptyDay ? undefined : onManualAddForDay}
            />
          </View>
        }
        ListEmptyComponent={
          isDayLoading || showEmptyDay ? (
            <TransactionDayCardPlaceholder
              dayKey={selectedDayKey}
              isLoading={isDayLoading}
              onManualAdd={onManualAddForDay}
            />
          ) : null
        }
        ListFooterComponent={
          (hasActivity || hasGhosts) && !isDayLoading ? (
            <TransactionDayCardFooter
              transactionCount={selectedDayTransactionCount}
              dayIncomeTotal={dayIncomeTotal}
              dayExpenseTotal={dayExpenseTotal}
              upcomingTotal={upcomingDayTotal}
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
    paddingBottom: FLOATING_BUTTONS_CLEARANCE,
  },
  header: {
    // The day-card header segment reserves top room for its card shadow.
    gap: spacing.md - CARD_SEGMENT_SHADOW_TOP_BLEED,
  },
}));
