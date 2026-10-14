import { format, isToday, parseISO } from "date-fns";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  EmptyState,
  emptyStateCopy,
  SurfaceCardSegment,
} from "@/components/shared";
import { SkeletonBlock } from "@/components/ui";
import { fontFamilies } from "@/constants/fonts";
import { radius } from "@/constants/radius";
import { spacing } from "@/constants/spacing";
import type { TransactionRow as TransactionRowData } from "@/features/transactions/types";
import { formatTransactionListAmount } from "@/features/transactions/utils/transactionDisplay";
import { isFutureDayKey } from "@/features/transactions/utils/transactionsCalendar";

import { DayAddButton } from "./DayAddButton";
import { TransactionRow } from "./TransactionRow";
import { createThemedStyles, useTheme } from "@/theme";

/**
 * The selected-day card on the Transactions tab, split into list segments so the rows can be
 * virtualized by a FlashList: header (list header), one row per item, footer or placeholder
 * (list footer / empty component). Together they read as a single rounded card.
 */

const SKELETON_COUNT = 4;

function formatDayLabel(dayKey: string): string {
  const date = parseISO(`${dayKey}T12:00:00`);
  return isToday(date) ? "Today" : format(date, "MMMM d");
}

export type TransactionDayCardHeaderProps = {
  dayKey: string;
  dayNetTotal: number;
  hasActivity: boolean;
  /** True while prefetching older pages to satisfy the selected day. */
  isFetching: boolean;
  /** Adds a transaction dated to `dayKey`; the button shows for today and past days only. */
  onAdd?: (dayKey: string) => void;
};

export const TransactionDayCardHeader = memo(function TransactionDayCardHeader({
  dayKey,
  dayNetTotal,
  hasActivity,
  isFetching,
  onAdd,
}: TransactionDayCardHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const netToneStyle =
    dayNetTotal > 0
      ? styles.netPositive
      : dayNetTotal < 0
        ? styles.netNegative
        : styles.netZero;

  return (
    <SurfaceCardSegment isFirst isLast={false}>
      <View style={styles.header}>
        <View style={styles.headerLeading}>
          <Text style={styles.dayLabel} numberOfLines={1}>
            {formatDayLabel(dayKey)}
          </Text>
          {onAdd && !isFutureDayKey(dayKey) ? (
            <DayAddButton dayKey={dayKey} onPress={onAdd} />
          ) : null}
        </View>
        <View style={styles.headerTrailing}>
          {isFetching ? (
            <ActivityIndicator size="small" color={colors.inkFaint} />
          ) : hasActivity ? (
            <Text style={[styles.dayNet, netToneStyle]} numberOfLines={1}>
              {formatTransactionListAmount(dayNetTotal)} net
            </Text>
          ) : null}
        </View>
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
  const styles = useStyles();
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
  const styles = useStyles();
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
  /** Adds a transaction dated to `dayKey`. */
  onManualAdd?: (dayKey: string) => void;
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
  const styles = useStyles();
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
  onManualAdd?: (dayKey: string) => void;
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
      onAction={
        showAddAction && onManualAdd ? () => onManualAdd(dayKey) : undefined
      }
    />
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  headerLeading: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: spacing.sm,
  },
  headerTrailing: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: spacing.md,
  },
  dayLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  dayNet: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  netPositive: {
    color: colors.success,
  },
  netNegative: {
    color: colors.danger,
  },
  netZero: {
    color: colors.inkSoft,
  },
  headerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  // Footer
  footerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
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
    color: colors.inkFaint,
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
    color: colors.success,
    fontVariant: ["tabular-nums"],
  },
  footerTotalsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    backgroundColor: colors.line,
  },
  footerExpense: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.danger,
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
}));
