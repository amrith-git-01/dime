import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { memo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CARD_SEGMENT_SHADOW_BLEED,
  CARD_SEGMENT_SHADOW_TOP_BLEED,
  EmptyState,
  emptyStateCopy,
  SurfaceCardSegment,
} from "@/components/shared";
import {
  accent,
  danger,
  inkSoft,
  line,
  paper,
  spacing,
  success,
} from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { TransactionRow } from "@/features/transactions/components";
import type { TransactionRow as TransactionRowType } from "@/features/transactions/types";
import type {
  TransactionListHeaderItem,
  TransactionListItem,
  TransactionListRowItem,
} from "@/features/transactions/utils/buildTransactionFlashListData";
import { formatTransactionListAmount } from "@/features/transactions/utils/transactionDisplay";

import { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";

type DayHeaderProps = {
  item: TransactionListHeaderItem;
};

const DayHeader = memo(function DayHeader({ item }: DayHeaderProps) {
  const netTotal = item.netTotal;
  const netColor = netTotal < 0 ? danger : netTotal > 0 ? success : inkSoft;

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{item.title}</Text>
      <Text style={[styles.sectionTotal, { color: netColor }]}>
        {formatTransactionListAmount(netTotal)}
      </Text>
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

function resolveListEmptyCopy(
  filter: "day" | "category" | "payee",
  usesRange: boolean,
) {
  if (filter === "day") {
    return emptyStateCopy.transactionsListDay;
  }
  if (filter === "category") {
    return usesRange
      ? emptyStateCopy.transactionsListCategoryRange
      : emptyStateCopy.transactionsListCategory;
  }
  return usesRange
    ? emptyStateCopy.transactionsListPayeeRange
    : emptyStateCopy.transactionsListPayee;
}

export default function TransactionsListScreen() {
  const {
    listItems,
    stickyHeaderIndices,
    filter,
    usesRange,
    isEmpty,
    isError,
    openTransactionDetail,
    showInitialLoading,
    showLoadingMore,
    loadMore,
    transactionCountLabel,
    transactionCountIsPlural,
    monthLabel,
  } = useTransactionsListScreenModel();
  const insets = useSafeAreaInsets();

  const renderItem: ListRenderItem<TransactionListItem> = ({ item }) =>
    item.kind === "header" ? (
      <DayHeader item={item} />
    ) : (
      <TransactionListRowView
        item={item}
        onTransactionPress={openTransactionDetail}
      />
    );

  if (showInitialLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={accent} size="large" />
      </View>
    );
  }

  if (isError) {
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
    const copy = resolveListEmptyCopy(filter, usesRange);
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
    <FlashList
      style={styles.fill}
      data={listItems}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      stickyHeaderIndices={stickyHeaderIndices}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        backgroundColor: paper,
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
        showLoadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator color={accent} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: paper,
  },
  subtitleRow: {
    paddingBottom: spacing.xl,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    // The first row segment reserves top room for its card shadow.
    paddingBottom: spacing.md - CARD_SEGMENT_SHADOW_TOP_BLEED,
    backgroundColor: paper,
  },
  sectionTitle: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
    lineHeight: 18,
    color: inkSoft,
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
    backgroundColor: line,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: paper,
  },
  loadingMore: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
});
