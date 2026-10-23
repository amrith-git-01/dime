import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { usePendingTransactions } from "@/features/outbox/hooks/usePendingTransactions";
import {
  addPendingToDaySummaries,
  addPendingToMonthTotals,
  isPendingTransactionRow,
  pendingInMonth,
  pendingTotals,
} from "@/features/outbox/utils/pendingMerge";
import { useRecurringMonthQuery } from "@/features/recurring/hooks/useRecurringMonthQuery";
import { useRecurringQuery } from "@/features/recurring/hooks/useRecurringQuery";
import type { RecurringOccurrence } from "@/features/recurring/types";
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
  groupUpcomingByDay,
  transactionCalendarDayKey,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { resolveDaySummary } from "@/features/transactions/utils/daySummaries";
import { parseTransactionAmount } from "@/features/transactions/utils/transactionDisplay";
import { useCurrentDay } from "@/hooks/useCurrentDay";
import { useTourCommand } from "@/hooks/useTourCommand";
import { useTourRestorable } from "@/hooks/useTourRestorable";
import { useTransactionQuickAddActions } from "@/hooks/useTransactionQuickAddActions";
import { triggerHaptic } from "@/lib/haptics/nativeHaptics";
import { emitTourEvent, tourEventNames } from "@/lib/tour/tourEvents";
import { usePendingSheetStore } from "@/stores/pendingSheetStore";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import {
  formatInrCompact,
  formatNetDisplay,
  formatSpendMagnitude,
} from "@/utils/currency";
import { toPaise } from "@/utils/paise";

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
  const recurringMonthQuery = useRecurringMonthQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const incomeRecurringQuery = useRecurringQuery("income");
  const subscriptionRecurringQuery = useRecurringQuery("subscription");
  const today = useCurrentDay();
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

  // Recurring occurrences still to be posted: drawn as ghost rows on today / future days, never counted.
  const upcomingByDay = useMemo(
    () => groupUpcomingByDay(recurringMonthQuery.data?.items, today),
    [recurringMonthQuery.data?.items, today],
  );
  const upcomingForSelectedDay = useMemo(
    () => upcomingByDay[selectedDayKey] ?? [],
    [selectedDayKey, upcomingByDay],
  );
  const upcomingDayKeys = useMemo(
    () => new Set(Object.keys(upcomingByDay)),
    [upcomingByDay],
  );
  const upcomingDayTotal = useMemo(
    () =>
      upcomingForSelectedDay.reduce(
        (sum, occurrence) =>
          occurrence.kind === "subscription"
            ? sum + toPaise(occurrence.amount) / 100
            : sum,
        0,
      ),
    [upcomingForSelectedDay],
  );
  const upcomingExpenseTotal =
    toPaise(recurringMonthQuery.data?.totals.fixed_expense_upcoming) / 100;

  const openUpcomingOccurrence = useCallback(
    (occurrence: RecurringOccurrence) => {
      const item = [
        ...(incomeRecurringQuery.data?.items ?? []),
        ...(subscriptionRecurringQuery.data?.items ?? []),
      ].find((candidate) => candidate.id === occurrence.id);
      if (item) {
        void triggerHaptic();
        navigation.navigate("RecurringEditor", { kind: item.kind, item });
      }
    },
    [
      incomeRecurringQuery.data?.items,
      navigation,
      subscriptionRecurringQuery.data?.items,
    ],
  );

  // Entries saved offline are merged in here for display only (never into the query cache).
  const { pendingRows } = usePendingTransactions();
  const monthPending = useMemo(
    () => pendingInMonth(pendingRows, selectedMonth.year, selectedMonth.monthIndex0),
    [pendingRows, selectedMonth.monthIndex0, selectedMonth.year],
  );

  const summary = useMemo((): TransactionsMonthBentoSummary | null => {
    const serverData = summaryQuery.data;
    if (!serverData) return null;
    const data = {
      ...serverData,
      ...addPendingToMonthTotals(serverData, pendingTotals(monthPending)),
    };
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
      upcomingDisplay: upcomingExpenseTotal > 0 ? formatInrCompact(upcomingExpenseTotal) : null,
    };
  }, [monthPending, summaryQuery.data, upcomingExpenseTotal]);

  // The server's loaded rows: paging and "older pages still to load" decisions look at these only.
  const flatRows = useMemo(() => {
    const pages = infiniteData?.pages ?? [];
    return pages.flatMap((p) => p.items);
  }, [infiniteData]);

  // What is shown: the loaded rows plus this month's waiting entries.
  const displayRows = useMemo(
    () => (monthPending.length > 0 ? [...monthPending, ...flatRows] : flatRows),
    [flatRows, monthPending],
  );

  const daySummaries = useMemo(
    () =>
      addPendingToDaySummaries(
        infiniteData?.pages[0]?.day_summaries ?? {},
        monthPending,
      ),
    [infiniteData, monthPending],
  );

  const dayTransactions = useMemo(
    () => filterTransactionsByCalendarDay(displayRows, selectedDayKey),
    [displayRows, selectedDayKey],
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
    () =>
      buildTransactionFlashListItemsForSingleDay(
        displayRows,
        selectedDayKey,
        upcomingForSelectedDay,
        today,
      ),
    [displayRows, selectedDayKey, today, upcomingForSelectedDay],
  );

  // Real transactions only: ghost rows never count towards loading or emptiness.
  const dayRowCount = dayTransactions.length;
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

  const openPendingSheet = usePendingSheetStore((state) => state.open);
  const openTransactionDetail = useCallback(
    (transaction: TransactionRow) => {
      void triggerHaptic();
      // A waiting entry has no server row to open: show the pending list instead.
      if (isPendingTransactionRow(transaction)) {
        openPendingSheet();
        return;
      }
      navigation.navigate("TransactionDetail", { transaction });
      emitTourEvent(tourEventNames.transactionOpened);
    },
    [navigation, openPendingSheet],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const selectDay = useCallback(
    (dayKey: string) => {
      void triggerHaptic();
      calendarSelectDay(dayKey);
      emitTourEvent(tourEventNames.daySelected);
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
    emitTourEvent(tourEventNames.monthChanged);
  }, [calendarGoPrevMonth, canGoPrevMonth]);

  const goNextMonth = useCallback(() => {
    if (!canGoNextMonth) return;
    void triggerHaptic();
    calendarGoNextMonth();
    emitTourEvent(tourEventNames.monthChanged);
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

  // The tour changes the month and the day; it puts them back when it ends.
  useTourRestorable("transactions.calendar", {
    snapshot: () => ({ monthIndex: selectedMonthIndex, dayKey: selectedDayKey }),
    restore: (snapshot) => {
      const { monthIndex, dayKey } = snapshot as { monthIndex: number; dayKey: string };
      calendarSelectMonth(monthIndex);
      calendarSelectDay(dayKey);
    },
  });

  // "Do it for me" on the Transactions tour's steps: pick another day that has spending, open the
  // day's first payment, move one month.
  useTourCommand("txPickDay", () => {
    const withSpend = Object.keys(spendByDay).sort().reverse();
    selectDay(withSpend.find((key) => key !== selectedDayKey) ?? selectedDayKey);
  });
  useTourCommand("txOpenTransaction", () => {
    const first = dayTransactions.find((tx) => !isPendingTransactionRow(tx));
    if (first) {
      openTransactionDetail(first);
    }
  });
  useTourCommand("txSwitchMonth", () => {
    if (canGoPrevMonth) {
      goPrevMonth();
    } else {
      goNextMonth();
    }
  });

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
    today,
    upcomingDayKeys,
    upcomingDayTotal,
    upcomingExpenseTotal,
    openUpcomingOccurrence,
    summaryFailed: summaryQuery.isError,
    summaryLoading: summaryQuery.isPending,
  };
}
