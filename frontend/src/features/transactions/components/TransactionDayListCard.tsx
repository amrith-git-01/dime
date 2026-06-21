import { format, isToday, parseISO } from "date-fns";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import {
  danger,
  ink,
  inkFaint,
  inkSoft,
  line,
  success,
  surface,
} from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { shadows } from "@/constants/shadows";
import { spacing } from "@/constants/spacing";
import type { TransactionRow as TransactionRowData } from "@/features/transactions/types";
import { formatTransactionListAmount } from "@/features/transactions/utils/transactionDisplay";
import { isFutureDayKey } from "@/features/transactions/utils/transactionsCalendar";

import { TransactionRow } from "./TransactionRow";

const SKELETON_COUNT = 4;

export type TransactionDayListCardProps = {
  dayKey: string;
  transactions: TransactionRowData[];
  /** Backend day summary totals for the selected day. */
  dayNetTotal: number;
  dayIncomeTotal: number;
  dayExpenseTotal: number;
  transactionCount: number;
  /** True while the month is loading for the first time. */
  isLoading: boolean;
  /** True while prefetching older pages to satisfy the selected day. */
  isFetching: boolean;
  onTransactionPress: (tx: TransactionRowData) => void;
  onManualAdd?: () => void;
};

function formatDayLabel(dayKey: string): string {
  const date = parseISO(`${dayKey}T12:00:00`);
  const formatted = format(date, "MMMM d");
  return isToday(date) ? `${formatted} · Today` : formatted;
}

export const TransactionDayListCard = memo(function TransactionDayListCard({
  dayKey,
  transactions,
  dayNetTotal,
  dayIncomeTotal,
  dayExpenseTotal,
  transactionCount,
  isLoading,
  isFetching,
  onTransactionPress,
  onManualAdd,
}: TransactionDayListCardProps) {
  const dayLabel = formatDayLabel(dayKey);
  const netDisplay = formatTransactionListAmount(dayNetTotal);
  const hasActivity = transactionCount > 0;

  const netToneStyle =
    dayNetTotal > 0
      ? styles.netPositive
      : dayNetTotal < 0
        ? styles.netNegative
        : styles.netZero;

  return (
    <View style={[styles.card, shadows.card]}>
      {/* Card header: date label + day net total */}
      <View style={styles.header}>
        <Text style={styles.dayLabel} numberOfLines={1}>
          {dayLabel}
        </Text>
        {isFetching ? (
          <ActivityIndicator size="small" color={inkFaint} />
        ) : hasActivity ? (
          <Text style={[styles.dayNet, netToneStyle]} numberOfLines={1}>
            {netDisplay} net
          </Text>
        ) : null}
      </View>
      <View style={styles.headerDivider} />

      {/* Transaction rows */}
      {isLoading ? (
        <SkeletonRows />
      ) : !hasActivity ? (
        <EmptyDayState dayKey={dayKey} onManualAdd={onManualAdd} />
      ) : (
        transactions.map((tx, index) => (
          <View key={tx.id}>
            {index > 0 && <View style={styles.rowDivider} />}
            <TransactionRow transaction={tx} onPress={onTransactionPress} />
          </View>
        ))
      )}

      {/* Footer */}
      {hasActivity && !isLoading && (
        <>
          <View style={styles.footerDivider} />
          <View style={styles.footer}>
            <Text style={styles.footerCount}>
              {transactionCount === 1
                ? "1 transaction"
                : `${transactionCount} transactions`}
            </Text>
            <View style={styles.footerTotals}>
              {dayIncomeTotal > 0 ? (
                <Text style={styles.footerIncome}>
                  {formatTransactionListAmount(dayIncomeTotal)}
                </Text>
              ) : null}
              {dayIncomeTotal > 0 && dayExpenseTotal > 0 ? (
                <View style={styles.footerTotalsDivider} />
              ) : null}
              {dayExpenseTotal > 0 ? (
                <Text style={styles.footerExpense}>
                  {formatTransactionListAmount(-dayExpenseTotal)}
                </Text>
              ) : null}
            </View>
          </View>
        </>
      )}
    </View>
  );
});

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <View key={i}>
          {i > 0 && <View style={styles.rowDivider} />}
          <View style={styles.skeletonRow}>
            <SkeletonBlock style={styles.skeletonTile} />
            <View style={styles.skeletonMeta}>
              <SkeletonBlock style={styles.skeletonPrimary} />
              <SkeletonBlock style={styles.skeletonSecondary} />
            </View>
            <SkeletonBlock style={styles.skeletonAmount} />
          </View>
        </View>
      ))}
    </>
  );
}

function EmptyDayState({
  dayKey,
  onManualAdd,
}: {
  dayKey: string;
  onManualAdd?: () => void;
}) {
  const isFutureDay = isFutureDayKey(dayKey);
  const showAddAction = Boolean(onManualAdd) && !isFutureDay;

  return (
    <EmptyState
      layout="inset"
      headline={emptyStateCopy.transactionsDay.headline}
      subtext={
        isFutureDay
          ? emptyStateCopy.transactionsDayFuture.subtext
          : emptyStateCopy.transactionsDay.subtext
      }
      actionLabel={
        showAddAction ? emptyStateCopy.transactionsDay.actionLabel : undefined
      }
      onAction={showAddAction ? onManualAdd : undefined}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  dayLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: ink,
  },
  dayNet: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  netPositive: {
    color: success,
  },
  netNegative: {
    color: danger,
  },
  netZero: {
    color: inkSoft,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
    marginHorizontal: spacing.lg,
  },
  // Footer
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: line,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  footerCount: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: inkFaint,
    flexShrink: 1,
  },
  footerTotals: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: spacing.sm,
  },
  footerIncome: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: success,
    fontVariant: ["tabular-nums"],
  },
  footerTotalsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: line,
  },
  footerExpense: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: danger,
    fontVariant: ["tabular-nums"],
  },
  // Skeleton
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  skeletonTile: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
  },
  skeletonMeta: {
    flex: 1,
    gap: 6,
  },
  skeletonPrimary: {
    height: 14,
    width: "55%",
    borderRadius: 4,
  },
  skeletonSecondary: {
    height: 11,
    width: "35%",
    borderRadius: 4,
  },
  skeletonAmount: {
    height: 14,
    width: 44,
    borderRadius: 4,
  },
});
