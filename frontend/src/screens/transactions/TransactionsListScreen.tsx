import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { memo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CARD_SEGMENT_SHADOW_BLEED,
  CARD_SEGMENT_SHADOW_TOP_BLEED,
  EmptyState,
  emptyStateCopy,
  SurfaceCardSegment,
} from "@/components/shared";
import { Button } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import { DayAddButton, TransactionRow } from "@/features/transactions/components";
import type { TransactionRow as TransactionRowType } from "@/features/transactions/types";
import type {
  TransactionListHeaderItem,
  TransactionListItem,
  TransactionListRowItem,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { resolveListEmptyCopy } from "./listEmptyCopy";
import { formatTransactionListAmount } from "@/features/transactions/utils/transactionDisplay";
import { isFutureDayKey } from "@/features/transactions/utils/transactionsCalendar";

import { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

type DayHeaderProps = {
  item: TransactionListHeaderItem;
  onAdd: (dayKey: string) => void;
};

const DayHeader = memo(function DayHeader({ item, onAdd }: DayHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const netTotal = item.netTotal;
  const netColor = netTotal < 0 ? colors.danger : netTotal > 0 ? colors.success : colors.inkSoft;

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      <View style={styles.sectionTrailing}>
        <Text style={[styles.sectionTotal, { color: netColor }]}>
          {formatTransactionListAmount(netTotal)}
        </Text>
        {isFutureDayKey(item.dayKey) ? null : (
          <DayAddButton dayKey={item.dayKey} onPress={onAdd} />
        )}
      </View>
    </View>
  );
});

type TransactionListRowViewProps = {
  item: TransactionListRowItem;
  onTransactionPress: (transaction: TransactionRowType) => void;
};

const TransactionListRowView = memo(function TransactionListRowView({
  item,
  onTransactionPress,
}: TransactionListRowViewProps) {
  const styles = useStyles();
  return (
    <View style={item.isLastInSection ? styles.lastRowInSection : undefined}>
      <SurfaceCardSegment
        isFirst={item.isFirstInSection}
        isLast={item.isLastInSection}
      >
        {item.isFirstInSection ? null : <View style={styles.rowDivider} />}
        <TransactionRow
          transaction={item.transaction}
          onPress={onTransactionPress}
        />
      </SurfaceCardSegment>
    </View>
  );
});

function keyExtractor(item: TransactionListItem): string {
  return item.id;
}

function getItemType(item: TransactionListItem): TransactionListItem["kind"] {
  return item.kind;
}

export default function TransactionsListScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const {
    listItems,
    filter,
    direction,
    usesRange,
    isEmpty,
    isError,
    hasLoadedRows,
    isRetrying,
    retry,
    openTransactionDetail,
    openManualAddForDay,
    showInitialLoading,
    showLoadingMore,
    loadMore,
    transactionCountLabel,
    transactionCountIsPlural,
    monthLabel,
  } = useTransactionsListScreenModel();
  const insets = useSafeAreaInsets();
  const listTourTarget = useTourTarget(tourTargetIds.transactionsListHeader);

  const renderItem: ListRenderItem<TransactionListItem> = ({ item }) =>
    item.kind === "header" ? (
      <DayHeader item={item} onAdd={openManualAddForDay} />
    ) : (
      <TransactionListRowView
        item={item}
        onTransactionPress={openTransactionDetail}
      />
    );

  if (showInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accentText} size="large" />
      </View>
    );
  }

  // Only a failure with nothing loaded replaces the list; otherwise the rows stay and the footer retries.
  if (isError && !hasLoadedRows) {
    return (
      <View style={styles.fill}>
        <EmptyState
          layout="centered"
          headline={emptyStateCopy.transactionsListError.headline}
          subtext={emptyStateCopy.transactionsListError.subtext}
        />
      </View>
    );
  }

  if (isEmpty) {
    const copy = resolveListEmptyCopy(filter, usesRange, direction);
    return (
      <View style={styles.fill}>
        <EmptyState
          layout="centered"
          headline={copy.headline}
          subtext={copy.subtext}
        />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <FlashList
        style={styles.fill}
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          backgroundColor: colors.paper,
          paddingHorizontal: spacing.lg + spacing.md,
          paddingTop: spacing.lg + spacing.md,
          paddingBottom: spacing.xl * 3 + insets.bottom,
        }}
        ListHeaderComponent={
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>
              {`${transactionCountLabel} transaction${transactionCountIsPlural ? "s" : ""} · ${monthLabel}`}
            </Text>
          </View>
        }
        ListFooterComponent={
          isError ? (
            <View style={styles.loadingMore}>
              <Text style={styles.footerError}>
                {emptyStateCopy.transactionsListError.headline}
              </Text>
              <View style={styles.retrySlot}>
                <Button
                  title="Retry"
                  variant="ghost"
                  size="compact"
                  onPress={retry}
                  loading={isRetrying}
                  accessibilityLabel="Retry loading transactions"
                />
              </View>
            </View>
          ) : showLoadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator color={colors.accentText} />
            </View>
          ) : null
        }
      />
    {/* Invisible box over the top of the list (its count, the first day and its rows), for the guided tour to spotlight. */}
    <View {...listTourTarget} pointerEvents="none" style={styles.tourBox} />
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  fill: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  tourBox: {
    position: "absolute",
    top: spacing.lg + spacing.md,
    left: spacing.lg + spacing.md,
    right: spacing.lg + spacing.md,
    height: 280,
  },
  subtitleRow: {
    paddingBottom: spacing.xl,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    // The first row segment reserves top room for its card shadow.
    paddingBottom: spacing.md - CARD_SEGMENT_SHADOW_TOP_BLEED,
    backgroundColor: colors.paper,
  },
  sectionTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionTotal: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  lastRowInSection: {
    // The last row segment reserves bottom room for its card shadow.
    paddingBottom: spacing.xl - CARD_SEGMENT_SHADOW_BLEED,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  footerError: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  retrySlot: {
    marginTop: spacing.sm,
  },
}));
