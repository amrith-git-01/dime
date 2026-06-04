import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { addDays, endOfMonth, format, parseISO, subDays } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  buildTransactionFlashListRowsOnly,
  transactionCalendarDayKey,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { filterTransactionsByPayee } from "@/features/transactions/utils/payeeKey";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import { triggerLightHaptic } from "@/lib/haptics/nativeHaptics";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import { useTransactionsInsightsIntentStore } from "@/stores/transactionsInsightsIntentStore";
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
  const [payeeFilter, setPayeeFilter] = useState<{
    payeeKey: string;
    payeeKeysTop: string[];
    displayName: string;
  } | null>(null);
  const skipNextMonthDayResetRef = useRef(false);
  const skipPayeeClearRef = useRef(false);
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

  useFocusEffect(
    useCallback(() => {
      const intent = useTransactionsInsightsIntentStore.getState().consume();
      if (intent) {
        skipNextMonthDayResetRef.current = true;
        const idx = monthOptions.findIndex(
          (m) => m.year === intent.year && m.monthIndex0 === intent.monthIndex0,
        );
        if (idx >= 0) {
          handleSelectMonth(idx);
        }
        if (intent.payeeKey) {
          skipPayeeClearRef.current = true;
          setPayeeFilter({
            payeeKey: intent.payeeKey,
            payeeKeysTop: intent.payeeKeysTop ?? [],
            displayName: intent.payeeDisplayName?.trim() || "Payee",
          });
        } else {
          setPayeeFilter(null);
        }
        if (intent.dayKey) {
          setSelectedDayKey(intent.dayKey);
        }
      }
    }, [handleSelectMonth, monthOptions]),
  );

  useEffect(() => {
    if (skipPayeeClearRef.current) {
      skipPayeeClearRef.current = false;
      return;
    }
    setPayeeFilter(null);
  }, [selectedMonth.year, selectedMonth.monthIndex0]);

  useEffect(() => {
    if (skipNextMonthDayResetRef.current) {
      skipNextMonthDayResetRef.current = false;
      return;
    }
    if (payeeFilter) {
      return;
    }
    const now = new Date();
    if (
      now.getFullYear() === selectedMonth.year &&
      now.getMonth() === selectedMonth.monthIndex0
    ) {
      setSelectedDayKey(format(now, "yyyy-MM-dd"));
      return;
    }
    setSelectedDayKey(monthDayBounds.endKey);
  }, [
    payeeFilter,
    selectedMonth.year,
    selectedMonth.monthIndex0,
    monthDayBounds.endKey,
  ]);

  usePrefetchTransactionsForSelectedDay({
    selectedDayKey,
    flatRows,
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
    disabled: payeeFilter != null,
  });

  useEffect(() => {
    if (!payeeFilter || !hasNextPage || isFetchingNextPage) {
      return;
    }
    void fetchNextPage();
  }, [
    payeeFilter,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    flatRows.length,
  ]);

  const payeeFilteredRows = useMemo(() => {
    if (!payeeFilter) {
      return null;
    }
    return filterTransactionsByPayee(
      flatRows,
      payeeFilter.payeeKey,
      payeeFilter.payeeKeysTop,
    );
  }, [flatRows, payeeFilter]);

  const flashListData = useMemo(() => {
    if (payeeFilteredRows) {
      return buildTransactionFlashListRowsOnly(payeeFilteredRows);
    }
    return buildTransactionFlashListItemsForSingleDay(flatRows, selectedDayKey);
  }, [flatRows, payeeFilteredRows, selectedDayKey]);

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
    !payeeFilter &&
    dayRowCount === 0 &&
    Boolean(hasNextPage) &&
    oldestLoadedDayKey !== null &&
    selectedDayKey < oldestLoadedDayKey;
  const showPayeeLoading =
    payeeFilter != null &&
    dayRowCount === 0 &&
    Boolean(hasNextPage) &&
    infinitePending === false;
  const showDayLoading =
    !payeeFilter && dayRowCount === 0 && waitingForOlderPages;
  const listEmpty =
    !infinitePending &&
    dayRowCount === 0 &&
    !showDayLoading &&
    !showPayeeLoading;

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
    if (showDayLoading || showPayeeLoading) {
      return "day-loading";
    }
    if (listEmpty) {
      return "empty";
    }
    return null;
  }, [listEmpty, showDayLoading, showMonthLoading, showPayeeLoading]);

  const showListFooter = Boolean(hasNextPage) && isFetchingNextPage;

  const listExtraData = useMemo(
    () => ({
      dayKey: selectedDayKey,
      monthIndex: selectedMonthIndex,
      lastRowIndex,
      payeeKey: payeeFilter?.payeeKey ?? null,
    }),
    [payeeFilter?.payeeKey, selectedDayKey, selectedMonthIndex, lastRowIndex],
  );

  const payeeFilterHeader = useMemo(() => {
    if (!payeeFilter) {
      return null;
    }
    return {
      displayName: payeeFilter.displayName,
      transactionCount: dayRowCount,
    };
  }, [dayRowCount, payeeFilter]);

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
    payeeFilterHeader,
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
