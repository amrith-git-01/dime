import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { memo, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { Button } from "@/components/ui";
import { FLOATING_BUTTONS_CLEARANCE, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  DayHeader,
  TransactionFilterBar,
  TransactionListRowView,
  transactionListItemType,
  transactionListKeyExtractor,
} from "@/features/transactions/components";
import type { TransactionRow } from "@/features/transactions/types";
import type { TransactionListItem } from "@/features/transactions/utils/buildTransactionFlashListData";
import { createThemedStyles, useTheme } from "@/theme";

import { resolveListEmptyCopy } from "./listEmptyCopy";
import {
  useTransactionsMonthListModel,
  type TransactionsMonthListArgs,
} from "./useTransactionsMonthListModel";

type MonthStepperProps = {
  monthLabel: string;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

/** The month stepper; stays above the list in every state. */
const MonthStepper = memo(function MonthStepper({
  monthLabel,
  canGoPrevMonth,
  canGoNextMonth,
  onPrevMonth,
  onNextMonth,
}: MonthStepperProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onPrevMonth}
        disabled={!canGoPrevMonth}
        style={styles.stepperButton}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        accessibilityState={{ disabled: !canGoPrevMonth }}
      >
        <ChevronLeft
          size={20}
          color={canGoPrevMonth ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
      <Text style={styles.stepperLabel}>{monthLabel}</Text>
      <Pressable
        onPress={onNextMonth}
        disabled={!canGoNextMonth}
        style={styles.stepperButton}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: !canGoNextMonth }}
      >
        <ChevronRight
          size={20}
          color={canGoNextMonth ? colors.inkSoft : colors.inkFaint}
          strokeWidth={2}
        />
      </Pressable>
    </View>
  );
});

export type TransactionsMonthListProps = TransactionsMonthListArgs & {
  onTransactionPress: (transaction: TransactionRow) => void;
  onAddForDay: (dayKey: string) => void;
};

/**
 * The Transactions tab's list view: a month's transactions grouped by day, with a month stepper,
 * a search field, filter chips and a totals line. The month and the filters are owned by the tab.
 */
export default function TransactionsMonthList({
  onTransactionPress,
  onAddForDay,
  ...modelArgs
}: TransactionsMonthListProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const model = useTransactionsMonthListModel(modelArgs);

  const renderItem: ListRenderItem<TransactionListItem> = ({ item }) =>
    item.kind === "header" ? (
      <DayHeader item={item} onAdd={onAddForDay} />
    ) : (
      <TransactionListRowView item={item} onTransactionPress={onTransactionPress} />
    );

  let body: ReactNode;
  if (model.showInitialLoading) {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accentText} size="large" />
      </View>
    );
  } else if (model.isError && !model.hasLoadedRows) {
    body = (
      <EmptyState
        layout="centered"
        headline={emptyStateCopy.transactionsListError.headline}
        subtext={emptyStateCopy.transactionsListError.subtext}
      />
    );
  } else if (model.isEmpty) {
    const copy = resolveListEmptyCopy("month", false, "debit", model.emptyKind);
    body = (
      <EmptyState
        layout="centered"
        headline={copy.headline}
        subtext={copy.subtext}
        actionLabel={model.activeFilterCount > 0 ? "Clear filters" : undefined}
        onAction={model.activeFilterCount > 0 ? model.clearFilters : undefined}
      />
    );
  } else {
    body = (
      <FlashList
        style={styles.fill}
        data={model.listItems}
        renderItem={renderItem}
        keyExtractor={transactionListKeyExtractor}
        getItemType={transactionListItemType}
        onEndReached={model.loadMore}
        onEndReachedThreshold={0.5}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        ListFooterComponent={
          model.isError ? (
            <View style={styles.footer}>
              <Text style={styles.footerError}>
                {emptyStateCopy.transactionsListError.headline}
              </Text>
              <View style={styles.retrySlot}>
                <Button
                  title="Retry"
                  variant="ghost"
                  size="compact"
                  onPress={model.retry}
                  loading={model.isRetrying}
                  accessibilityLabel="Retry loading transactions"
                />
              </View>
            </View>
          ) : model.showLoadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={colors.accentText} />
            </View>
          ) : null
        }
      />
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <MonthStepper
          monthLabel={model.monthLabel}
          canGoPrevMonth={model.canGoPrevMonth}
          canGoNextMonth={model.canGoNextMonth}
          onPrevMonth={model.goPrevMonth}
          onNextMonth={model.goNextMonth}
        />
        <TransactionFilterBar
          criteria={modelArgs.criteria}
          onCriteriaChange={modelArgs.onCriteriaChange}
          payeeOptions={model.payeeOptions}
          amountDomain={model.amountDomain}
        />
        {model.showInitialLoading ||
        model.isEmpty ||
        (model.isError && !model.hasLoadedRows) ? null : (
          <Text style={styles.totals} accessibilityLiveRegion="polite">
            {model.totalsLine}
          </Text>
        )}
      </View>
      {body}
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => ({
  fill: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperLabel: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: FLOATING_BUTTONS_CLEARANCE,
  },
  totals: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    fontVariant: ["tabular-nums"],
  },
  footer: {
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
