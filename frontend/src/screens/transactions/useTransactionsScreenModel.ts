import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { addDays, endOfMonth, format, parseISO, subDays } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useBentoMonthSelection } from "@/components/bento";
import type { TransactionsMonthBentoSummary } from "@/features/transactions/components";
import { usePrefetchTransactionsForSelectedDay } from "@/features/transactions/hooks/usePrefetchTransactionsForSelectedDay";
import {
  useMonthSummaryQuery,
  useTransactionsMonthInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionRow } from "@/features/transactions/types";
import {
  buildTransactionFlashListItemsForSingleDay,
  transactionCalendarDayKey,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
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
  const {
    monthOptions,
    selectedMonth,
    selectedMonthIndex,
    selectMonth: handleSelectMonth,
  } = useBentoMonthSelection();
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const { onManualAdd, onReceipt, onVoice } =
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
    const pages = infiniteData?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [infiniteData]);

  const monthDayBounds = useMemo(() => {
    const anchor = new Date(selectedMonth.year, selectedMonth.monthIndex0, 1);
    return {
      startKey: format(anchor, "yyyy-MM-dd"),
      endKey: format(endOfMonth(anchor), "yyyy-MM-dd"),
    };
  }, [selectedMonth.year, selectedMonth.monthIndex0]);

  useEffect(() => {
    const now = new Date();
    if (
      now.getFullYear() === selectedMonth.year &&
      now.getMonth() === selectedMonth.monthIndex0
    ) {
      setSelectedDayKey(format(now, "yyyy-MM-dd"));
      return;
    }
    setSelectedDayKey(monthDayBounds.endKey);
  }, [selectedMonth.year, selectedMonth.monthIndex0, monthDayBounds.endKey]);

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

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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

  const waitingForOlderPages =
    dayRowCount === 0 &&
    Boolean(hasNextPage) &&
    oldestLoadedDayKey !== null &&
    selectedDayKey < oldestLoadedDayKey;
  const showDayLoading = dayRowCount === 0 && waitingForOlderPages;
  const listEmpty = !infinitePending && dayRowCount === 0 && !showDayLoading;

  const monthHasNoTransactions =
    !summaryQuery.isPending &&
    !summaryQuery.isError &&
    summary !== null &&
    summary.transactionCount === 0;

  const showMonthLoading = infinitePending && flatRows.length === 0;

  const emptyVariant = useMemo((): TransactionsEmptyVariant => {
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
  }, [listEmpty, showDayLoading, showMonthLoading]);

  const showListFooter = Boolean(hasNextPage) && isFetchingNextPage;

  const listExtraData = useMemo(
    () => ({
      dayKey: selectedDayKey,
      monthIndex: selectedMonthIndex,
      lastRowIndex,
    }),
    [selectedDayKey, selectedMonthIndex, lastRowIndex],
  );

  return {
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
    selectedMonthIndex,
    showListFooter,
    showMonthLoading,
    summary,
    summaryFailed: summaryQuery.isError,
    summaryLoading: summaryQuery.isPending,
  };
}
