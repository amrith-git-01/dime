import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Calendar, Receipt } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import {
  BentoQuickAddPills,
  BentoSectionCardSegment,
  BentoTransactionTile,
  TwoToneEmptyState,
} from "@/components/shared";
import { colors, spacing } from "@/constants";
import {
  TransactionsBentoHeader,
  TransactionsListRowsSkeleton,
} from "@/features/transactions/components";
import type { TransactionFlashListItem } from "@/features/transactions/utils/buildTransactionFlashListData";

import { useTransactionsScreenModel } from "./useTransactionsScreenModel";

const TransactionsListFooter = memo(function TransactionsListFooter({
  show,
}: {
  show: boolean;
}) {
  if (!show) {
    return null;
  }
  return (
    <View style={styles.listFooter}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
});

export default function TransactionsScreen() {
  const listRef = useRef<FlashListRef<TransactionFlashListItem>>(null);
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const {
    canGoNextDay,
    canGoPrevDay,
    dayRowCount,
    emptyVariant,
    flashListData,
    goNextDay,
    goPrevDay,
    handleLoadMore,
    handleSelectMonth,
    lastRowIndex,
    listExtraData,
    monthHasNoTransactions,
    monthOptions,
    onManualAdd,
    onReceipt,
    onVoice,
    openTransactionDetail,
    selectedDayKey,
    selectedMonth,
    showListFooter,
    showMonthLoading,
    summary,
    summaryFailed,
    summaryLoading,
  } = useTransactionsScreenModel();

  useEffect(() => {
    listRef.current?.scrollToTop({ animated: false });
  }, [listExtraData.dayKey, listExtraData.monthIndex]);

  const renderFlashRow = useCallback(
    ({ item, index }: { item: TransactionFlashListItem; index: number }) => {
      const isFirst = index === 0;
      const isLast = index === lastRowIndex;
      return (
        <BentoSectionCardSegment
          isFirst={isFirst}
          isLast={isLast}
          showGapAfter={!isLast}
        >
          <BentoTransactionTile
            transaction={item.transaction}
            onPress={openTransactionDetail}
          />
        </BentoSectionCardSegment>
      );
    },
    [lastRowIndex, openTransactionDetail],
  );

  const keyExtractor = useCallback(
    (item: TransactionFlashListItem) => item.id,
    [],
  );
  const getItemType = useCallback(() => "row" as const, []);

  // Tile (64) + gap (16) for typical non-first/non-last items
  const overrideItemLayout = useCallback(
    (layout: { span?: number; size?: number }) => {
      layout.size = 80;
    },
    [],
  );

  const listEmptyComponent = useMemo(() => {
    if (emptyVariant === null) {
      return null;
    }
    if (emptyVariant === "month-loading" || emptyVariant === "day-loading") {
      return <TransactionsListRowsSkeleton />;
    }
    return (
      <TwoToneEmptyState
        layout="inline"
        icon={monthHasNoTransactions ? Receipt : Calendar}
        title={
          monthHasNoTransactions
            ? "No transactions here"
            : "No transactions on this day"
        }
        message={
          monthHasNoTransactions
            ? "No transactions are available for this period."
            : "Try another day or add a transaction."
        }
        footer={
          monthHasNoTransactions ? (
            <BentoQuickAddPills
              onManualAdd={onManualAdd}
              onReceipt={onReceipt}
              onVoice={onVoice}
            />
          ) : undefined
        }
      />
    );
  }, [emptyVariant, monthHasNoTransactions, onManualAdd, onReceipt, onVoice]);

  const listFooter = useMemo(
    () => <TransactionsListFooter show={showListFooter} />,
    [showListFooter],
  );

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          <TransactionsBentoHeader
            selectedMonthLabel={selectedMonth.label}
            summary={summary}
            summaryLoading={summaryLoading}
            summaryFailed={summaryFailed}
            monthOptions={monthOptions}
            onSelectMonth={handleSelectMonth}
            selectedDayKey={selectedDayKey}
            transactionCount={dayRowCount}
            canGoPrevDay={canGoPrevDay}
            canGoNextDay={canGoNextDay}
            onPrevDay={goPrevDay}
            onNextDay={goNextDay}
            onMonthMenuOpenChange={setMonthMenuOpen}
            dayBarLoading={showMonthLoading}
            dayBarCountLoading={emptyVariant === "day-loading"}
          />
        </View>
        <FlashList
          ref={listRef}
          style={styles.list}
          scrollEnabled={!monthMenuOpen}
          data={flashListData}
          extraData={listExtraData}
          renderItem={renderFlashRow}
          keyExtractor={keyExtractor}
          getItemType={getItemType}
          overrideItemLayout={overrideItemLayout}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={listEmptyComponent}
          ListFooterComponent={listFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  headerSlot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  list: {
    flex: 1,
  },
  listFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
});
