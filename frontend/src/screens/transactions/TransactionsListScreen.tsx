import { FlashList, type FlashListRef, type ListRenderItem } from "@shopify/flash-list";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { Button } from "@/components/ui";
import { spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import { tourTargetIds } from "@/constants/tourTargetIds";
import { useTourTarget } from "@/hooks/useTourTarget";
import {
  DayHeader,
  TransactionListRowView,
  transactionListItemType,
  transactionListKeyExtractor,
} from "@/features/transactions/components";
import type { TransactionListItem } from "@/features/transactions/utils/buildTransactionFlashListData";
import { CategoryMonthSection } from "./CategoryMonthSection";
import { resolveListEmptyCopy } from "./listEmptyCopy";

import { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

export default function TransactionsListScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const {
    categoryCard,
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
    subtitle,
    recurringName,
  } = useTransactionsListScreenModel();
  const insets = useSafeAreaInsets();
  const listTourTarget = useTourTarget(tourTargetIds.transactionsListHeader);
  const listRef = useRef<FlashListRef<TransactionListItem>>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const cardMonthKey = categoryCard?.monthKey;

  // Another month is another list: start it at the top.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [cardMonthKey]);

  const renderItem: ListRenderItem<TransactionListItem> = ({ item }) =>
    item.kind === "header" ? (
      <DayHeader item={item} onAdd={openManualAddForDay} />
    ) : (
      <TransactionListRowView
        item={item}
        onTransactionPress={openTransactionDetail}
      />
    );

  // Only a failure with nothing loaded replaces the list; otherwise the rows stay and the footer retries.
  const showLoadError = isError && !hasLoadedRows;
  const emptyCopy = isEmpty
    ? resolveListEmptyCopy(filter, usesRange, direction, "all", recurringName)
    : null;

  // A category's list keeps its card (and month navigator) in every state, so it stays mounted
  // and the loading, error and empty bodies sit under it; the other lists swap the whole screen.
  const listState = showInitialLoading ? "loading" : showLoadError ? "error" : emptyCopy ? "empty" : "list";
  const stateContent =
    listState === "loading" ? (
      <ActivityIndicator color={colors.accentText} size="large" />
    ) : listState === "error" ? (
      <EmptyState
        layout="centered"
        headline={emptyStateCopy.transactionsListError.headline}
        subtext={emptyStateCopy.transactionsListError.subtext}
      />
    ) : emptyCopy ? (
      <EmptyState
        layout="centered"
        headline={emptyCopy.headline}
        subtext={emptyCopy.subtext}
      />
    ) : null;

  if (!categoryCard && listState === "loading") {
    return <View style={styles.centered}>{stateContent}</View>;
  }

  if (!categoryCard && listState !== "list") {
    return <View style={styles.fill}>{stateContent}</View>;
  }

  const stateBody = stateContent ? <View style={styles.stateBody}>{stateContent}</View> : null;

  return (
    <View style={styles.fill}>
      <FlashList
        ref={listRef}
        style={styles.fill}
        data={listState === "list" ? listItems : []}
        renderItem={renderItem}
        keyExtractor={transactionListKeyExtractor}
        getItemType={transactionListItemType}
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
          <>
            {categoryCard ? (
              <View onLayout={(event: LayoutChangeEvent) => setCardHeight(event.nativeEvent.layout.height)}>
                <CategoryMonthSection card={categoryCard} />
              </View>
            ) : null}
            {listState === "loading" || listState === "error" ? null : (
              <View style={styles.subtitleRow}>
                <Text style={styles.subtitle}>
                  {subtitle}
                </Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={stateBody}
        ListFooterComponent={
          listState !== "list" ? null : isError ? (
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
    {/* A category's list starts below its card; wait for the card to lay out so the first measurement is not over it. */}
    {!categoryCard || cardHeight > 0 ? (
      <View
        {...listTourTarget}
        pointerEvents="none"
        style={[styles.tourBox, categoryCard ? { top: spacing.lg + spacing.md + cardHeight } : null]}
      />
    ) : null}
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
  stateBody: {
    minHeight: 320,
    justifyContent: "center",
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
