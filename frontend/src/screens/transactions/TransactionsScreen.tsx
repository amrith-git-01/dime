import { format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";

import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { SelectDropdown } from "@/components/ui/SelectDropdown/SelectDropdown";
import { fontFamilies } from "@/constants/fonts";
import { TransactionDetailModal } from "@/features/transactions/components/TransactionDetailModal";
import { TransactionListRow } from "@/features/transactions/components/TransactionListRow";
import { TransactionListSectionSkeleton } from "@/features/transactions/components/TransactionListSectionSkeleton";
import {
  formatTransactionListAmount,
  signedAmount,
} from "@/features/transactions/components/transactionListShared";
import {
  useMonthSummaryQuery,
  useTransactionsMonthInfiniteQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { TransactionRow } from "@/features/transactions/types";

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

type MonthOption = {
  label: string;
  year: number;
  monthIndex0: number;
};

function buildMonthOptions(now: Date = new Date()): MonthOption[] {
  const startCurrent = startOfMonth(now);
  return Array.from({ length: 6 }, (_, index) => {
    const d = subMonths(startCurrent, index);
    return {
      label: format(d, "MMM yyyy"),
      year: d.getFullYear(),
      monthIndex0: d.getMonth(),
    };
  });
}

type TransactionSection = {
  date: string;
  dailyTotal: number;
  sectionIndex: number;
  data: TransactionRow[];
};

function sectionDateHeading(dateKey: string): string {
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const yesterdayKey = format(subDays(new Date(), 1), "yyyy-MM-dd");
  if (dateKey === todayKey) {
    return "TODAY";
  }
  if (dateKey === yesterdayKey) {
    return "YESTERDAY";
  }
  const d = parseISO(`${dateKey}T12:00:00`);
  return format(d, "EEE, d MMM").toUpperCase();
}

function groupTransactions(transactions: TransactionRow[]) {
  const order: string[] = [];
  const grouped = new Map<string, TransactionRow[]>();

  transactions.forEach((transaction) => {
    const parsed = parseISO(transaction.transaction_at);
    const key = format(parsed, "yyyy-MM-dd");
    if (!grouped.has(key)) {
      order.push(key);
      grouped.set(key, []);
    }
    grouped.get(key)?.push(transaction);
  });

  order.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return order.map((dateKey, sectionIndex) => {
    const data = grouped.get(dateKey) ?? [];
    const dailyTotal = data.reduce((total, transaction) => {
      return total + signedAmount(transaction);
    }, 0);

    return {
      date: sectionDateHeading(dateKey),
      dailyTotal,
      sectionIndex,
      data,
    };
  });
}

function transactionAnimationOrder(
  sectionIndex: number,
) {
  return sectionIndex;
}

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
            <Text style={styles.heroTitle}>Couldn't load summary</Text>
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
              {summaryFailed ? "—" : formatTransactionListAmount(summary.credited)}
            </Text>
          )}
        </View>

        <View style={styles.heroStatCard}>
          <Text style={styles.heroStatLabel}>Debited</Text>
          {summaryLoading ? (
            <ActivityIndicator color={palette.surface} />
          ) : (
            <Text style={styles.heroStatValue}>
              {summaryFailed ? "—" : formatTransactionListAmount(summary.debited)}
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

type DateHeaderProps = {
  section: TransactionSection;
  sectionIndex: number;
};

const DateHeader = memo(function DateHeader({
  section,
  sectionIndex,
}: DateHeaderProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        delay: sectionIndex === 0 ? 100 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 160,
        delay: sectionIndex === 0 ? 100 : 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, sectionIndex, translateY]);

  return (
    <Animated.View
      style={[
        styles.dateHeader,
        sectionIndex === 0 && styles.firstDateHeader,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.dateLabel}>{section.date}</Text>
      <View style={styles.dateLine} />
      <Text
        style={[
          styles.dailyTotal,
          section.dailyTotal > 0
            ? styles.dailyTotalPositive
            : section.dailyTotal < 0
              ? styles.dailyTotalNegative
              : null,
        ]}
        numberOfLines={1}
      >
        {formatTransactionListAmount(section.dailyTotal)}
      </Text>
    </Animated.View>
  );
});

export default function TransactionsScreen() {
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [visibleTransactionIds, setVisibleTransactionIds] = useState<string[]>([]);

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

  const sections = useMemo(() => groupTransactions(flatRows), [flatRows]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionRow | null>(null);
  const sectionIndexByTransactionId = useMemo(() => {
    const lookup = new Map<string, number>();
    sections.forEach((section) => {
      section.data.forEach((transaction) => {
        lookup.set(transaction.id, section.sectionIndex);
      });
    });
    return lookup;
  }, [sections]);
  const visibleSectionIndices = useMemo(() => {
    const next = new Set<number>();
    visibleTransactionIds.forEach((transactionId) => {
      const sectionIndex = sectionIndexByTransactionId.get(transactionId);
      if (typeof sectionIndex === "number") {
        next.add(sectionIndex);
      }
    });
    return next;
  }, [sectionIndexByTransactionId, visibleTransactionIds]);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 45,
    minimumViewTime: 80,
  }).current;
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const nextVisibleIds = viewableItems
        .map((token) => token.key)
        .filter((key): key is string => Boolean(key));

      setVisibleTransactionIds((current) => {
        if (
          current.length === nextVisibleIds.length &&
          current.every((id, index) => id === nextVisibleIds[index])
        ) {
          return current;
        }
        return nextVisibleIds;
      });
    },
  ).current;

  const handleSelectMonth = useCallback((index: number) => {
    setSelectedMonthIndex(index);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (infinite.hasNextPage && !infinite.isFetchingNextPage) {
      void infinite.fetchNextPage();
    }
  }, [infinite]);

  const listEmpty =
    !infinite.isPending && !infinite.isFetching && flatRows.length === 0;

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={handleViewableItemsChanged}
          renderSectionHeader={({ section }) => {
            return (
              <DateHeader
                section={section}
                sectionIndex={section.sectionIndex}
              />
            );
          }}
          renderItem={({ item, index, section }) => {
            return (
              <TransactionListRow
                transaction={item}
                variant="screen"
                rowIndex={index}
                animationOrder={transactionAnimationOrder(section.sectionIndex)}
                isVisible={visibleSectionIndices.has(section.sectionIndex)}
                onPress={(tx) => {
                  setSelectedTransaction(tx);
                }}
              />
            );
          }}
          ListHeaderComponent={
            <TransactionsHeroCard
              selectedMonth={selected.label}
              summary={summary}
              summaryLoading={summaryQuery.isPending}
              summaryFailed={summaryQuery.isError}
              onSelectMonth={handleSelectMonth}
              monthOptions={monthOptions}
            />
          }
          ListEmptyComponent={
            infinite.isPending && flatRows.length === 0 ? (
              <TransactionListSectionSkeleton rows={2} />
            ) : listEmpty ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No transactions here</Text>
                <Text style={styles.emptyText}>
                  No transactions are available for this period.
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            infinite.hasNextPage ? (
              <View style={styles.listFooter}>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleLoadMore}
                  disabled={infinite.isFetchingNextPage}
                  style={({ pressed }) => [
                    styles.loadMoreButton,
                    pressed && !infinite.isFetchingNextPage && styles.loadMoreButtonPressed,
                    infinite.isFetchingNextPage && styles.loadMoreButtonDisabled,
                  ]}
                >
                  {infinite.isFetchingNextPage ? (
                    <ActivityIndicator color={palette.surface} />
                  ) : (
                    <Text style={styles.loadMoreButtonText}>Load more</Text>
                  )}
                </Pressable>
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          initialNumToRender={15}
          removeClippedSubviews
        />
        <TransactionDetailModal
          visible={!!selectedTransaction}
          transaction={selectedTransaction}
          onClose={() => {
            setSelectedTransaction(null);
          }}
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
  fullLoading: {
    backgroundColor: palette.background,
    pointerEvents: "none",
  },
  listFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  loadMoreButton: {
    minHeight: 44,
    minWidth: 132,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: palette.primary,
  },
  loadMoreButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  loadMoreButtonDisabled: {
    opacity: 0.82,
  },
  loadMoreButtonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 18,
    color: palette.surface,
  },
  heroCard: {
    position: "relative",
    overflow: "visible",
    marginTop: 16,
    marginBottom: 16,
    padding: 24,
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
    gap: 10,
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
    marginTop: 4,
    fontFamily: fontFamilies.semiBold,
    fontSize: 28,
    lineHeight: 36,
    color: palette.surface,
  },
  heroTitleRow: {
    minHeight: 36,
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
    marginTop: 24,
  },
  heroStatCard: {
    flex: 1,
    minHeight: 72,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroNetCard: {
    zIndex: 1,
    marginTop: 8,
    minHeight: 64,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroNetValue: {
    marginTop: 4,
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
    marginTop: 4,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    color: palette.surface,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
  },
  firstDateHeader: {
    marginTop: 12,
  },
  dateLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
    color: palette.textSecondary,
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.borderLight,
  },
  dailyTotal: {
    minWidth: 82,
    fontFamily: fontFamilies.monoSemiBold,
    fontSize: 14,
    lineHeight: 18,
    textAlign: "right",
    color: palette.textPrimary,
  },
  dailyTotalPositive: {
    color: palette.success,
  },
  dailyTotalNegative: {
    color: palette.danger,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 96,
    paddingHorizontal: 16,
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
});
