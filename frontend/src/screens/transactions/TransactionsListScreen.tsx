import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { ActivityIndicator, Text, View } from "react-native";
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
import { resolveListEmptyCopy } from "./listEmptyCopy";

import { useTransactionsListScreenModel } from "./useTransactionsListScreenModel";
import { createThemedStyles, useTheme } from "@/theme";

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
    subtitle,
    recurringName,
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
    const copy = resolveListEmptyCopy(filter, usesRange, direction, "all", recurringName);
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
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>
              {subtitle}
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
