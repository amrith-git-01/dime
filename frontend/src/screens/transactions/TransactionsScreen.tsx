import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { addDays, endOfMonth, format, parseISO, subDays } from "date-fns";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BentoSectionCardSegment } from "@/components/home/bento/BentoSectionCard";
import { BentoTransactionTile } from "@/components/home/bento/BentoTransactionTile";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { TransactionsBentoHeader } from "@/components/transactions/bento/TransactionsBentoHeader";
import { TransactionsBentoSkeleton } from "@/components/transactions/bento/TransactionsBentoSkeleton";
import { TRANSACTIONS_MONTH_OPTIONS_COUNT } from "@/components/transactions/bento/transactionsBentoTokens";
import { TransactionsDayEmpty } from "@/components/transactions/bento/TransactionsDayEmpty";
import type { TransactionsMonthBentoSummary } from "@/components/transactions/bento/TransactionsMonthBentoCard";
import { colors, spacing } from "@/constants/theme";
import {
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/features/transactions/formatAmount";
import { usePrefetchTransactionsForSelectedDay } from "@/features/transactions/hooks/usePrefetchTransactionsForSelectedDay";
import { useReceiptCameraTransaction } from "@/features/transactions/hooks/useReceiptCameraTransaction";
import {
  useMonthSummaryQuery,
  useTransactionsMonthInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionRow } from "@/features/transactions/types";
import {
  buildTransactionFlashListItemsForSingleDay,
  transactionCalendarDayKey,
  type TransactionFlashListItem,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import { useVoiceCaptureUiStore } from "@/stores/voiceCaptureUiStore";
import { buildMonthOptions } from "@/utils/buildMonthOptions";

type TransactionsScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Transactions">,
  NativeStackNavigationProp<MainStackParamList>
>;

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
  const navigation = useNavigation<TransactionsScreenNavigation>();
  const listRef = useRef<FlashListRef<TransactionFlashListItem>>(null);
  const monthOptions = useMemo(
    () => buildMonthOptions(TRANSACTIONS_MONTH_OPTIONS_COUNT),
    [],
  );
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  const captureReceiptAndCreate = useReceiptCameraTransaction();
  const openVoiceCapture = useVoiceCaptureUiStore((s) => s.open);

  const selected = monthOptions[selectedMonthIndex] ?? monthOptions[0];

  const summaryQuery = useMonthSummaryQuery(
    selected.year,
    selected.monthIndex0,
  );
  const infinite = useTransactionsMonthInfiniteQuery(
    selected.year,
    selected.monthIndex0,
  );

  const summary = useMemo((): TransactionsMonthBentoSummary | null => {
    const data = summaryQuery.data;
    if (!data) {
      return null;
    }
    return {
      transactionCount: data.transaction_count,
      spentDisplay: formatSpendMagnitude(data.debit_total),
      creditedDisplay: formatSpendMagnitude(data.credit_total),
      debitedDisplay: formatSpendMagnitude(data.debit_total),
      netDisplay: formatNetDisplay(data.net),
      netValue: (() => {
        const n = Number.parseFloat(data.net);
        return Number.isFinite(n) ? n : 0;
      })(),
    };
  }, [summaryQuery.data]);

  const flatRows = useMemo(() => {
    const pages = infinite.data?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [infinite.data]);

  const monthDayBounds = useMemo(() => {
    const anchor = new Date(selected.year, selected.monthIndex0, 1);
    return {
      startKey: format(anchor, "yyyy-MM-dd"),
      endKey: format(endOfMonth(anchor), "yyyy-MM-dd"),
    };
  }, [selected.year, selected.monthIndex0]);

  useEffect(() => {
    const now = new Date();
    if (
      now.getFullYear() === selected.year &&
      now.getMonth() === selected.monthIndex0
    ) {
      setSelectedDayKey(format(now, "yyyy-MM-dd"));
      return;
    }
    setSelectedDayKey(monthDayBounds.endKey);
  }, [selected.year, selected.monthIndex0, monthDayBounds.endKey]);

  usePrefetchTransactionsForSelectedDay({
    selectedDayKey,
    flatRows,
    hasNextPage: Boolean(infinite.hasNextPage),
    isFetchingNextPage: infinite.isFetchingNextPage,
    fetchNextPage: infinite.fetchNextPage,
  });

  const flashListData = useMemo(
    () => buildTransactionFlashListItemsForSingleDay(flatRows, selectedDayKey),
    [flatRows, selectedDayKey],
  );

  const dayRowCount = useMemo(
    () => flashListData.filter((item) => item.kind === "row").length,
    [flashListData],
  );

  const lastRowIndex = dayRowCount > 0 ? dayRowCount - 1 : -1;

  const oldestLoadedDayKey = useMemo(() => {
    if (flatRows.length === 0) {
      return null;
    }
    return transactionCalendarDayKey(
      flatRows[flatRows.length - 1].transaction_at,
    );
  }, [flatRows]);

  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      void triggerLightHaptic();
      navigation.navigate("TransactionDetail", { transaction });
    },
    [navigation],
  );

  const handleSelectMonth = useCallback((index: number) => {
    setSelectedMonthIndex(index);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (infinite.hasNextPage && !infinite.isFetchingNextPage) {
      void infinite.fetchNextPage();
    }
  }, [
    infinite.fetchNextPage,
    infinite.hasNextPage,
    infinite.isFetchingNextPage,
  ]);

  const canGoPrevDay = selectedDayKey > monthDayBounds.startKey;
  const canGoNextDay = selectedDayKey < monthDayBounds.endKey;

  const goPrevDay = useCallback(() => {
    if (!canGoPrevDay) {
      return;
    }
    void triggerLightHaptic();
    setSelectedDayKey((current) =>
      format(subDays(parseISO(`${current}T12:00:00`), 1), "yyyy-MM-dd"),
    );
  }, [canGoPrevDay]);

  const goNextDay = useCallback(() => {
    if (!canGoNextDay) {
      return;
    }
    void triggerLightHaptic();
    setSelectedDayKey((current) =>
      format(addDays(parseISO(`${current}T12:00:00`), 1), "yyyy-MM-dd"),
    );
  }, [canGoNextDay]);

  const onManualAdd = useCallback(() => {
    navigation.navigate("ManualAddTransaction");
  }, [navigation]);

  const onReceipt = useCallback(() => {
    void captureReceiptAndCreate();
  }, [captureReceiptAndCreate]);

  const onVoice = useCallback(() => {
    openVoiceCapture();
  }, [openVoiceCapture]);

  useEffect(() => {
    listRef.current?.scrollToTop({ animated: false });
  }, [selectedDayKey, selectedMonthIndex]);

  const renderFlashRow = useCallback(
    ({ item, index }: { item: TransactionFlashListItem; index: number }) => {
      if (item.kind !== "row") {
        return null;
      }
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

  const waitingForOlderPages =
    dayRowCount === 0 &&
    Boolean(infinite.hasNextPage) &&
    oldestLoadedDayKey !== null &&
    selectedDayKey < oldestLoadedDayKey;

  const showDayLoading = dayRowCount === 0 && waitingForOlderPages;

  const listEmpty = !infinite.isPending && dayRowCount === 0 && !showDayLoading;

  const monthHasNoTransactions =
    !summaryQuery.isPending &&
    !summaryQuery.isError &&
    summary !== null &&
    summary.transactionCount === 0;

  const showMonthLoading = infinite.isPending && flatRows.length === 0;

  const emptyVariant = useMemo(():
    | "month-loading"
    | "day-loading"
    | "empty"
    | null => {
    if (showMonthLoading) {
      return "month-loading";
    }
    if (showDayLoading) {
      return "day-loading";
    }
    if (listEmpty) {
      return "empty";
    }
    return null;
  }, [flatRows.length, listEmpty, showDayLoading, showMonthLoading]);

  const listEmptyComponent = useMemo(() => {
    if (emptyVariant === null) {
      return null;
    }
    return (
      <TransactionsDayEmpty
        variant={emptyVariant}
        monthHasNoTransactions={monthHasNoTransactions}
        onManualAdd={onManualAdd}
        onReceipt={onReceipt}
        onVoice={onVoice}
      />
    );
  }, [emptyVariant, monthHasNoTransactions, onManualAdd, onReceipt, onVoice]);

  const showListFooter =
    Boolean(infinite.hasNextPage) && infinite.isFetchingNextPage;

  const listFooter = useMemo(
    () => <TransactionsListFooter show={showListFooter} />,
    [showListFooter],
  );

  const listExtraData = useMemo(
    () => ({
      dayKey: selectedDayKey,
      monthIndex: selectedMonthIndex,
      lastRowIndex,
    }),
    [selectedDayKey, selectedMonthIndex, lastRowIndex],
  );

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        <View style={styles.headerSlot}>
          {showMonthLoading ? (
            <TransactionsBentoSkeleton />
          ) : (
            <TransactionsBentoHeader
              selectedMonthLabel={selected.label}
              summary={summary}
              summaryLoading={summaryQuery.isPending}
              summaryFailed={summaryQuery.isError}
              monthOptions={monthOptions}
              onSelectMonth={handleSelectMonth}
              selectedDayKey={selectedDayKey}
              transactionCount={dayRowCount}
              canGoPrevDay={canGoPrevDay}
              canGoNextDay={canGoNextDay}
              onPrevDay={goPrevDay}
              onNextDay={goNextDay}
            />
          )}
        </View>
        <FlashList
          ref={listRef}
          style={styles.list}
          data={flashListData}
          extraData={listExtraData}
          renderItem={renderFlashRow}
          keyExtractor={(item) => item.id}
          getItemType={() => "row"}
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
