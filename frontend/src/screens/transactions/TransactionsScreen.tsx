import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { addDays, endOfMonth, format, parseISO, subDays } from "date-fns";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { TransactionDayNavigator } from "@/features/transactions/components/TransactionDayNavigator";
import { TransactionListRow } from "@/features/transactions/components/TransactionListRow";
import { TransactionListSectionSkeleton } from "@/features/transactions/components/TransactionListSectionSkeleton";
import {
  TransactionsMonthHeroCard,
  type TransactionsMonthSummary,
} from "@/features/transactions/components/TransactionsMonthHeroCard";
import { usePrefetchTransactionsForSelectedDay } from "@/features/transactions/hooks/usePrefetchTransactionsForSelectedDay";
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
import { buildMonthOptions } from "@/utils/buildMonthOptions";

type TransactionsScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Transactions">,
  NativeStackNavigationProp<MainStackParamList>
>;

type TransactionsListHeaderProps = {
  selectedMonthLabel: string;
  summary: TransactionsMonthSummary;
  summaryLoading: boolean;
  summaryFailed: boolean;
  monthOptions: ReturnType<typeof buildMonthOptions>;
  onSelectMonth: (index: number) => void;
  selectedDayKey: string;
  transactionCount: number;
  canGoPrevDay: boolean;
  canGoNextDay: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
};

const TransactionsListHeader = memo(function TransactionsListHeader({
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
}: TransactionsListHeaderProps) {
  return (
    <View>
      <TransactionsMonthHeroCard
        selectedMonth={selectedMonthLabel}
        summary={summary}
        summaryLoading={summaryLoading}
        summaryFailed={summaryFailed}
        onSelectMonth={onSelectMonth}
        monthOptions={monthOptions}
      />
      <View style={styles.dayNavigatorGap}>
        <TransactionDayNavigator
          dayKey={selectedDayKey}
          transactionCount={transactionCount}
          canGoPrev={canGoPrevDay}
          canGoNext={canGoNextDay}
          onPrev={onPrevDay}
          onNext={onNextDay}
        />
      </View>
    </View>
  );
});

type TransactionsListEmptyProps = {
  variant: "month-loading" | "day-loading" | "empty";
  monthHasNoTransactions: boolean;
};

const TransactionsListEmpty = memo(function TransactionsListEmpty({
  variant,
  monthHasNoTransactions,
}: TransactionsListEmptyProps) {
  if (variant === "month-loading") {
    return (
      <TransactionListSectionSkeleton rows={3} showSectionHeader={false} />
    );
  }

  if (variant === "day-loading") {
    return (
      <View style={styles.emptyStateBelowNavigator}>
        <ActivityIndicator color={colors.headerGradientStart} />
        <Text style={[styles.emptyText, styles.emptyLoadingText]}>
          Loading this day…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>
        {monthHasNoTransactions
          ? "No transactions here"
          : "No transactions on this day"}
      </Text>
      <Text style={styles.emptyText}>
        {monthHasNoTransactions
          ? "No transactions are available for this period."
          : "Try another day or add a transaction."}
      </Text>
    </View>
  );
});

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
      <ActivityIndicator color={colors.headerGradientStart} />
    </View>
  );
});

export default function TransactionsScreen() {
  const navigation = useNavigation<TransactionsScreenNavigation>();
  const listRef = useRef<FlashListRef<TransactionFlashListItem>>(null);
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  const selected = monthOptions[selectedMonthIndex] ?? monthOptions[0];

  const summaryQuery = useMonthSummaryQuery(
    selected.year,
    selected.monthIndex0,
  );
  const infinite = useTransactionsMonthInfiniteQuery(
    selected.year,
    selected.monthIndex0,
  );

  const summary = useMemo((): TransactionsMonthSummary => {
    const data = summaryQuery.data;
    if (!data) {
      return { credited: 0, debited: 0, net: 0, count: 0 };
    }
    const credited = Number.parseFloat(data.credit_total);
    const debitMag = Number.parseFloat(data.debit_total);
    const net = Number.parseFloat(data.net);
    return {
      credited: Number.isFinite(credited) ? credited : 0,
      debited: Number.isFinite(debitMag) ? -debitMag : 0,
      net: Number.isFinite(net) ? net : 0,
      count: data.transaction_count,
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

  const filteredRows = useMemo(
    () =>
      flatRows.filter(
        (row) =>
          transactionCalendarDayKey(row.transaction_at) === selectedDayKey,
      ),
    [flatRows, selectedDayKey],
  );

  const flashListData = useMemo(
    () => buildTransactionFlashListItemsForSingleDay(flatRows, selectedDayKey),
    [flatRows, selectedDayKey],
  );

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

  useEffect(() => {
    listRef.current?.scrollToTop({ animated: false });
  }, [selectedDayKey, selectedMonthIndex]);

  const renderFlashRow = useCallback(
    ({ item }: { item: TransactionFlashListItem }) => {
      if (item.kind !== "row") {
        return null;
      }
      return (
        <TransactionListRow
          transaction={item.transaction}
          variant="screen"
          rowIndex={item.sectionRowIndex}
          enableScrollAnimations={false}
          onPress={openTransactionDetail}
        />
      );
    },
    [openTransactionDetail],
  );

  const waitingForOlderPages =
    filteredRows.length === 0 &&
    Boolean(infinite.hasNextPage) &&
    oldestLoadedDayKey !== null &&
    selectedDayKey < oldestLoadedDayKey;

  const showDayLoading = filteredRows.length === 0 && waitingForOlderPages;

  const listEmpty =
    !infinite.isPending && filteredRows.length === 0 && !showDayLoading;

  const monthHasNoTransactions =
    !summaryQuery.isPending && !summaryQuery.isError && summary.count === 0;

  const emptyVariant = useMemo(():
    | TransactionsListEmptyProps["variant"]
    | null => {
    if (infinite.isPending && flatRows.length === 0) {
      return "month-loading";
    }
    if (showDayLoading) {
      return "day-loading";
    }
    if (listEmpty) {
      return "empty";
    }
    return null;
  }, [flatRows.length, infinite.isPending, listEmpty, showDayLoading]);

  const listHeader = useMemo(
    () => (
      <TransactionsListHeader
        selectedMonthLabel={selected.label}
        summary={summary}
        summaryLoading={summaryQuery.isPending}
        summaryFailed={summaryQuery.isError}
        monthOptions={monthOptions}
        onSelectMonth={handleSelectMonth}
        selectedDayKey={selectedDayKey}
        transactionCount={filteredRows.length}
        canGoPrevDay={canGoPrevDay}
        canGoNextDay={canGoNextDay}
        onPrevDay={goPrevDay}
        onNextDay={goNextDay}
      />
    ),
    [
      selected.label,
      summary,
      summaryQuery.isPending,
      summaryQuery.isError,
      monthOptions,
      handleSelectMonth,
      selectedDayKey,
      filteredRows.length,
      canGoPrevDay,
      canGoNextDay,
      goPrevDay,
      goNextDay,
    ],
  );

  const listEmptyComponent = useMemo(() => {
    if (emptyVariant === null) {
      return null;
    }
    return (
      <TransactionsListEmpty
        variant={emptyVariant}
        monthHasNoTransactions={monthHasNoTransactions}
      />
    );
  }, [emptyVariant, monthHasNoTransactions]);

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
    }),
    [selectedDayKey, selectedMonthIndex],
  );

  return (
    <TabScreenShell>
      <View style={styles.screen}>
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
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmptyComponent}
          ListFooterComponent={listFooter}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
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
  list: {
    flex: 1,
  },
  listFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  dayNavigatorGap: {
    marginBottom: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xl * 4,
    paddingHorizontal: spacing.lg,
  },
  emptyStateBelowNavigator: {
    marginTop: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  emptyText: {
    marginTop: spacing.sm,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: "center",
  },
  emptyLoadingText: {
    marginTop: spacing.md,
  },
});
