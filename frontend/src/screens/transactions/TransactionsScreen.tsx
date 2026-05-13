import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlashList } from "@shopify/flash-list";
import { addDays, endOfMonth, format, parseISO, subDays } from "date-fns";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { fontFamilies } from "@/constants/fonts";
import { spacing } from "@/constants/theme";
import { TransactionDayNavigator } from "@/features/transactions/components/TransactionDayNavigator";
import { TransactionListRow } from "@/features/transactions/components/TransactionListRow";
import { TransactionListSectionSkeleton } from "@/features/transactions/components/TransactionListSectionSkeleton";
import { formatTransactionListAmount } from "@/features/transactions/components/transactionListShared";
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
import { buildMonthOptions, type MonthOption } from "@/utils/buildMonthOptions";

const palette = {
  primary: "#6355E8",
  primaryLight: "#7C6EF8",
  primaryMuted: "#EEEDFB",
  background: "#F5F4FF",
  surface: "#FFFFFF",
  surfaceTint: "#FAFAFF",
  textPrimary: "#0A0A1F",
  textSecondary: "#6B6B80",
  borderLight: "#EEEEFF",
  chipBorder: "#E0DFFA",
  success: "#16A34A",
  danger: "#DC2626",
} as const;

type TransactionsScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Transactions">,
  NativeStackNavigationProp<MainStackParamList>
>;

type TransactionsHeroCardProps = {
  selectedMonth: string;
  summary: {
    credited: number;
    debited: number;
    net: number;
    count: number;
  };
  summaryLoading: boolean;
  summaryFailed: boolean;
  onSelectMonth: (index: number) => void;
  monthOptions: MonthOption[];
};

const TransactionsHeroCard = memo(function TransactionsHeroCard({
  selectedMonth,
  summary,
  summaryLoading,
  summaryFailed,
  onSelectMonth,
  monthOptions,
}: TransactionsHeroCardProps) {
  const dropdownOptions = monthOptions.map((month) => ({
    label: month.label,
    value: month.label,
  }));

  return (
    <View style={styles.heroCard}>
      <View style={styles.heroBubbleLarge} />
      <View style={styles.heroBubbleSmall} />

      <View style={styles.heroHeader}>
        <View style={styles.heroHeaderTopRow}>
          <Text style={styles.heroKicker}>Total Transactions</Text>
          <View style={styles.monthDropdownWrap}>
            <SelectDropdown
              options={dropdownOptions}
              value={selectedMonth}
              onChange={(next) => {
                const index = monthOptions.findIndex(
                  (month) => month.label === next,
                );
                if (index >= 0) {
                  onSelectMonth(index);
                }
              }}
              variant="secondary"
              showLabel={false}
            />
          </View>
        </View>

        <View style={styles.heroTitleRow}>
          {summaryFailed ? (
            <Text style={styles.heroTitle}>Could not load summary</Text>
          ) : summaryLoading ? (
            <ActivityIndicator color={palette.surface} />
          ) : (
            <Text style={styles.heroTitle}>{summary.count}</Text>
          )}
        </View>
      </View>

      <View style={styles.heroStatsGrid}>
        <View style={styles.heroStatCard}>
          <Text style={styles.heroStatLabel}>Credited</Text>
          {summaryLoading ? (
            <ActivityIndicator color={palette.surface} />
          ) : (
            <Text style={styles.heroStatValue}>
              {summaryFailed
                ? "—"
                : formatTransactionListAmount(summary.credited)}
            </Text>
          )}
        </View>

        <View style={styles.heroStatCard}>
          <Text style={styles.heroStatLabel}>Debited</Text>
          {summaryLoading ? (
            <ActivityIndicator color={palette.surface} />
          ) : (
            <Text style={styles.heroStatValue}>
              {summaryFailed
                ? "—"
                : formatTransactionListAmount(summary.debited)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.heroNetCard}>
        <Text style={styles.heroStatLabel}>Net Amount</Text>
        {summaryLoading ? (
          <ActivityIndicator color={palette.surface} />
        ) : (
          <Text style={styles.heroNetValue}>
            {summaryFailed ? "—" : formatTransactionListAmount(summary.net)}
          </Text>
        )}
      </View>
    </View>
  );
});

export default function TransactionsScreen() {
  const navigation = useNavigation<TransactionsScreenNavigation>();
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

  const summary = useMemo(() => {
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
  }, [infinite]);

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

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        <FlashList
          style={styles.list}
          data={flashListData}
          renderItem={renderFlashRow}
          keyExtractor={(item) => item.id}
          getItemType={() => "row"}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.35}
          ListHeaderComponent={
            <View>
              <TransactionsHeroCard
                selectedMonth={selected.label}
                summary={summary}
                summaryLoading={summaryQuery.isPending}
                summaryFailed={summaryQuery.isError}
                onSelectMonth={handleSelectMonth}
                monthOptions={monthOptions}
              />
              <View style={styles.dayNavigatorGap}>
                <TransactionDayNavigator
                  dayKey={selectedDayKey}
                  transactionCount={filteredRows.length}
                  canGoPrev={canGoPrevDay}
                  canGoNext={canGoNextDay}
                  onPrev={goPrevDay}
                  onNext={goNextDay}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            infinite.isPending && flatRows.length === 0 ? (
              <TransactionListSectionSkeleton
                rows={3}
                showSectionHeader={false}
              />
            ) : showDayLoading ? (
              <View style={styles.emptyStateBelowNavigator}>
                <ActivityIndicator color={palette.primary} />
                <Text style={[styles.emptyText, styles.emptyLoadingText]}>
                  Loading this day…
                </Text>
              </View>
            ) : listEmpty ? (
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
            ) : null
          }
          ListFooterComponent={
            infinite.hasNextPage && infinite.isFetchingNextPage ? (
              <View style={styles.listFooter}>
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : null
          }
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
    backgroundColor: palette.background,
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
  heroCard: {
    position: "relative",
    overflow: "visible",
    marginTop: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: palette.primary,
    borderWidth: 1,
    borderColor: palette.primaryLight,
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 7,
    zIndex: 3,
  },
  heroBubbleLarge: {
    position: "absolute",
    top: -52,
    right: -42,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  heroBubbleSmall: {
    position: "absolute",
    right: 28,
    bottom: -72,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroHeader: {
    zIndex: 2,
    gap: 6,
  },
  heroHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroKicker: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 22,
    color: palette.surface,
  },
  heroTitle: {
    marginTop: 2,
    fontFamily: fontFamilies.semiBold,
    fontSize: 26,
    lineHeight: 32,
    color: palette.surface,
  },
  heroTitleRow: {
    minHeight: 32,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  monthDropdownWrap: {
    position: "relative",
    zIndex: 5,
  },
  heroStatsGrid: {
    zIndex: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  heroStatCard: {
    flex: 1,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroNetCard: {
    zIndex: 1,
    marginTop: 6,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroNetValue: {
    marginTop: 2,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 16,
    lineHeight: 20,
    color: palette.surface,
  },
  heroStatLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255,255,255,0.72)",
  },
  heroStatValue: {
    marginTop: 2,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: palette.surface,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 96,
    paddingHorizontal: 16,
  },
  emptyStateBelowNavigator: {
    marginTop: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingBottom: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: palette.textPrimary,
  },
  emptyText: {
    marginTop: 8,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: palette.textSecondary,
    textAlign: "center",
  },
  emptyLoadingText: {
    marginTop: 12,
  },
});
