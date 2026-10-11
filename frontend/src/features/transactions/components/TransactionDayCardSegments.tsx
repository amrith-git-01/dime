import { format, isToday, parseISO } from "date-fns";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  EmptyState,
  emptyStateCopy,
  SurfaceCardSegment,
} from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import {
  danger,
  ink,
  inkFaint,
  inkSoft,
  line,
  success,
} from "@/constants/colors";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import type { TransactionRow as TransactionRowData } from "@/features/transactions/types";
import { formatTransactionListAmount } from "@/features/transactions/utils/transactionDisplay";
import { isFutureDayKey } from "@/features/transactions/utils/transactionsCalendar";

import { TransactionRow } from "./TransactionRow";

/**
 * The selected-day card on the Transactions tab, split into list segments so the rows can be
 * virtualized by a FlashList: header (list header), one row per item, footer or placeholder
 * (list footer / empty component). Together they read as a single rounded card.
 */

const SKELETON_COUNT = 4;

function formatDayLabel(dayKey: string): string {
  const date = parseISO(`${dayKey}T12:00:00`);
  const formatted = format(date, "MMMM d");
  return isToday(date) ? `${formatted} · Today` : formatted;
}

export type TransactionDayCardHeaderProps = {
  dayKey: string;
  dayNetTotal: number;
  hasActivity: boolean;
  /** True while prefetching older pages to satisfy the selected day. */
  isFetching: boolean;
};

export const TransactionDayCardHeader = memo(function TransactionDayCardHeader({
  dayKey,
  dayNetTotal,
  hasActivity,
  isFetching,
}: TransactionDayCardHeaderProps) {
  const netToneStyle =
    dayNetTotal > 0
      ? styles.netPositive
      : dayNetTotal < 0
        ? styles.netNegative
        : styles.netZero;

  return (
    <SurfaceCardSegment isFirst isLast={false}>
      <View style={styles.header}>
        <Text style={styles.dayLabel} numberOfLines={1}>
          {formatDayLabel(dayKey)}
        </Text>
        {isFetching ? (
          <ActivityIndicator size="small" color={inkFaint} />
        ) : hasActivity ? (
          <Text style={[styles.dayNet, netToneStyle]} numberOfLines={1}>
            {formatTransactionListAmount(dayNetTotal)} net
          </Text>
        ) : null}
      </View>
      <View style={styles.headerDivider} />
    </SurfaceCardSegment>
  );
});

export type TransactionDayCardRowProps = {
  transaction: TransactionRowData;
  /** False for the first row, which sits directly under the header divider. */
  showDivider: boolean;
  onPress: (tx: TransactionRowData) => void;
};

export const TransactionDayCardRow = memo(function TransactionDayCardRow({
  transaction,
  showDivider,
  onPress,
}: TransactionDayCardRowProps) {
  return (
    <SurfaceCardSegment isFirst={false} isLast={false}>
      {showDivider ? <View style={styles.rowDivider} /> : null}
      <TransactionRow transaction={transaction} onPress={onPress} />
    </SurfaceCardSegment>
  );
});

export type TransactionDayCardFooterProps = {
  transactionCount: number;
  dayIncomeTotal: number;
  dayExpenseTotal: number;
};

export const TransactionDayCardFooter = memo(function TransactionDayCardFooter({
  transactionCount,
  dayIncomeTotal,
  dayExpenseTotal,
}: TransactionDayCardFooterProps) {
  return (
    <SurfaceCardSegment isFirst={false} isLast>
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
    </SurfaceCardSegment>
  );
});

export type TransactionDayCardPlaceholderProps = {
  dayKey: string;
  /** Skeleton rows while the month loads; otherwise the empty-day message. */
  isLoading: boolean;
  onManualAdd?: () => void;
};

/** Card body (and bottom edge) when there are no rows to show. */
export const TransactionDayCardPlaceholder = memo(
  function TransactionDayCardPlaceholder({
    dayKey,
    isLoading,
    onManualAdd,
  }: TransactionDayCardPlaceholderProps) {
    return (
      <SurfaceCardSegment isFirst={false} isLast>
        {isLoading ? (
          <SkeletonRows />
        ) : (
          <EmptyDayState dayKey={dayKey} onManualAdd={onManualAdd} />
        )}
      </SurfaceCardSegment>
    );
  },
);

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
