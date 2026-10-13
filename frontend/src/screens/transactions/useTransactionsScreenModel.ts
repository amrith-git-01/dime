import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import type { TransactionsMonthBentoSummary } from "@/features/transactions/components";
import { usePrefetchTransactionsForSelectedDay } from "@/features/transactions/hooks/usePrefetchTransactionsForSelectedDay";
import { useTransactionsCalendarSelection } from "@/features/transactions/hooks/useTransactionsCalendarSelection";
import {
  useMonthSummaryQuery,
  useTransactionsMonthInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionRow } from "@/features/transactions/types";
import {
  buildTransactionFlashListItemsForSingleDay,
  filterTransactionsByCalendarDay,
  transactionCalendarDayKey,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { resolveDaySummary } from "@/features/transactions/utils/daySummaries";
import { parseTransactionAmount } from "@/features/transactions/utils/transactionDisplay";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import { formatNetDisplay, formatSpendMagnitude } from "@/utils/currency";

type TransactionsScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Transactions">,
  NativeStackNavigationProp<MainStackParamList>
>;

export type TransactionsEmptyVariant =
  | "month-loading"
  | "day-loading"
  | "empty"
  | null;

export function useTransactionsScreenModel() {
  const navigation = useNavigation<TransactionsScreenNavigation>();
  const calendar = useTransactionsCalendarSelection();
  const {
    canGoNextDay,
    canGoNextMonth,
    canGoPrevDay,
    canGoPrevMonth,
    goNextDay: calendarGoNextDay,
    goNextMonth: calendarGoNextMonth,
    goPrevDay: calendarGoPrevDay,
    goPrevMonth: calendarGoPrevMonth,
    monthOptions,
    selectDay: calendarSelectDay,
    selectMonth: calendarSelectMonth,
    selectedDayKey,
    selectedMonth,
    selectedMonthIndex,
  } = calendar;
  const { onManualAddForDay, onReceipt, onVoice } =
    useTransactionQuickAddActions(navigation);

  const summaryQuery = useMonthSummaryQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending: infinitePending,
  } = useTransactionsMonthInfiniteQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );

  const summary = useMemo((): TransactionsMonthBentoSummary | null => {
    const data = summaryQuery.data;
    if (!data) return null;
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
    const pages = infiniteData?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [infiniteData]);

  const daySummaries = useMemo(
    () => infiniteData?.pages[0]?.day_summaries ?? {},
    [infiniteData],
  );

  const dayTransactions = useMemo(
    () => filterTransactionsByCalendarDay(flatRows, selectedDayKey),
    [flatRows, selectedDayKey],
  );

  const selectedDaySummary = useMemo(
    () =>
      resolveDaySummary(
        selectedDayKey,
        daySummaries[selectedDayKey],
        dayTransactions,
      ),
    [dayTransactions, daySummaries, selectedDayKey],
  );
  const dayNetTotal = parseTransactionAmount(selectedDaySummary?.net);
  const dayIncomeTotal = parseTransactionAmount(
    selectedDaySummary?.credit_total,
  );
  const dayExpenseTotal = parseTransactionAmount(
    selectedDaySummary?.debit_total,
  );
  // Emptiness never rests on the summary alone: listed rows count as activity too.
  const selectedDayTransactionCount = Math.max(
    selectedDaySummary?.transaction_count ?? 0,
    dayTransactions.length,
  );

  usePrefetchTransactionsForSelectedDay({
    selectedDayKey,
    flatRows,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
  });

  const flashListData = useMemo(
    () => buildTransactionFlashListItemsForSingleDay(flatRows, selectedDayKey),
    [flatRows, selectedDayKey],
  );

  const dayRowCount = useMemo(() => flashListData.length, [flashListData]);
  const lastRowIndex = dayRowCount > 0 ? dayRowCount - 1 : -1;

  const spendByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const summary of Object.values(daySummaries)) {
      const debit = parseTransactionAmount(summary.debit_total);
      if (debit > 0) {
        map[summary.date] = debit;
      }
    }
    return map;
  }, [daySummaries]);

  const oldestLoadedDayKey = useMemo(() => {
    if (flatRows.length === 0) return null;
    return transactionCalendarDayKey(
      flatRows[flatRows.length - 1].transaction_at,
    );
  }, [flatRows]);

  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      void triggerHaptic();
      navigation.navigate("TransactionDetail", { transaction });
    },
    [navigation],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const selectDay = useCallback(
    (dayKey: string) => {
      void triggerHaptic();
      calendarSelectDay(dayKey);
    },
    [calendarSelectDay],
  );

  const handleSelectMonth = useCallback(
    (monthIndex: number) => {
      calendarSelectMonth(monthIndex);
    },
    [calendarSelectMonth],
  );

  const goPrevMonth = useCallback(() => {
    if (!canGoPrevMonth) return;
    void triggerHaptic();
    calendarGoPrevMonth();
  }, [calendarGoPrevMonth, canGoPrevMonth]);

  const goNextMonth = useCallback(() => {
    if (!canGoNextMonth) return;
    void triggerHaptic();
    calendarGoNextMonth();
  }, [calendarGoNextMonth, canGoNextMonth]);

  const goPrevDay = useCallback(() => {
    if (!canGoPrevDay) return;
    void triggerHaptic();
    calendarGoPrevDay();
  }, [calendarGoPrevDay, canGoPrevDay]);

  const goNextDay = useCallback(() => {
    if (!canGoNextDay) return;
    void triggerHaptic();
    calendarGoNextDay();
  }, [calendarGoNextDay, canGoNextDay]);

  const waitingForOlderPages =
    selectedDayTransactionCount > 0 &&
    dayRowCount === 0 &&
    Boolean(hasNextPage) &&
    oldestLoadedDayKey !== null &&
    selectedDayKey < oldestLoadedDayKey;
  const showDayLoading = waitingForOlderPages;
  const showMonthLoading = infinitePending && flatRows.length === 0;
  const summariesReady =
    infiniteData?.pages[0] !== undefined && !infinitePending;
  const listEmpty =
    summariesReady && selectedDayTransactionCount === 0 && !showDayLoading;

  const monthHasNoTransactions =
    !summaryQuery.isPending &&
    !summaryQuery.isError &&
    summary !== null &&
    summary.transactionCount === 0;

  const emptyVariant = useMemo((): TransactionsEmptyVariant => {
    if (showMonthLoading) return "month-loading";
    if (showDayLoading) return "day-loading";
    if (listEmpty) return "empty";
    return null;
  }, [listEmpty, showDayLoading, showMonthLoading]);

  const showListFooter = Boolean(hasNextPage) && isFetchingNextPage;

  const listExtraData = useMemo(
    () => ({
      dayKey: selectedDayKey,
      monthIndex: selectedMonthIndex,
      lastRowIndex,
    }),
    [lastRowIndex, selectedDayKey, selectedMonthIndex],
  );

  return {
    canGoNextDay,
    canGoPrevDay,
    canGoPrevMonth,
    canGoNextMonth,
    dayNetTotal,
    dayIncomeTotal,
    dayExpenseTotal,
    selectedDayTransactionCount,
    dayRowCount,
    dayTransactions,
    emptyVariant,
    flashListData,
    goNextDay,
    goPrevDay,
    goPrevMonth,
    goNextMonth,
    handleLoadMore,
    handleSelectMonth,
    lastRowIndex,
    listExtraData,
    monthHasNoTransactions,
    monthOptions,
    onManualAddForDay,
    onReceipt,
    onVoice,
    openTransactionDetail,
    selectedDayKey,
    selectedMonth,
    selectedMonthIndex,
    selectDay,
    showListFooter,
    showMonthLoading,
    spendByDay,
    summary,
    summaryFailed: summaryQuery.isError,
    summaryLoading: summaryQuery.isPending,
  };
}
