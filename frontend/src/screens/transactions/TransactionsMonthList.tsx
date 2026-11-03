import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react-native";
import { memo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { EmptyState, emptyStateCopy } from "@/components/shared";
import { Button } from "@/components/ui";
import { FLOATING_BUTTONS_CLEARANCE, radius, spacing } from "@/constants";
import { fontFamilies } from "@/constants/fonts";
import {
  DayHeader,
  TransactionListRowView,
  transactionListItemType,
  transactionListKeyExtractor,
} from "@/features/transactions/components";
import { TransactionFilterSheet } from "@/features/transactions/components/TransactionFilterSheet";
import type { TransactionRow } from "@/features/transactions/types";
import type { TransactionListItem } from "@/features/transactions/utils/buildTransactionFlashListData";
import {
  MONTH_LIST_KIND_LABELS,
  MONTH_LIST_KINDS,
  type MonthListKind,
} from "@/features/transactions/utils/monthListFilter";
import { createThemedStyles, useTheme } from "@/theme";

import { resolveListEmptyCopy } from "./listEmptyCopy";
import {
  useTransactionsMonthListModel,
  type TransactionsMonthListArgs,
} from "./useTransactionsMonthListModel";

type MonthListHeaderProps = {
  monthLabel: string;
  kindChip: MonthListKind | null;
  canGoPrevMonth: boolean;
  canGoNextMonth: boolean;
  activeFilterCount: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenFilters: () => void;
  onSelectKind: (kind: MonthListKind) => void;
};

/** Month stepper, the quick chips and the Filters button; stays above the list in every state. */
const MonthListHeader = memo(function MonthListHeader({
  monthLabel,
  kindChip,
  canGoPrevMonth,
  canGoNextMonth,
  activeFilterCount,
  onPrevMonth,
  onNextMonth,
  onOpenFilters,
  onSelectKind,
}: MonthListHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.header}>
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
      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {MONTH_LIST_KINDS.map((option) => {
            const selected = option === kindChip;
            return (
              <Pressable
                key={option}
                onPress={() => onSelectKind(option)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${MONTH_LIST_KIND_LABELS[option]} transactions`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {MONTH_LIST_KIND_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          onPress={onOpenFilters}
          style={styles.filtersButton}
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0
              ? `Filters, ${activeFilterCount} active`
              : "Filters"
          }
        >
          <SlidersHorizontal size={14} color={colors.accentText} strokeWidth={2.25} />
          <Text style={styles.filtersButtonText}>Filters</Text>
          {activeFilterCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
});

export type TransactionsMonthListProps = TransactionsMonthListArgs & {
  onTransactionPress: (transaction: TransactionRow) => void;
  onAddForDay: (dayKey: string) => void;
};

/**
 * The Transactions tab's list view: a month's transactions grouped by day, with a month stepper,
 * quick chips and a Filters sheet. The month and the filters are owned by the tab.
 */
export default function TransactionsMonthList({
  onTransactionPress,
  onAddForDay,
  ...modelArgs
}: TransactionsMonthListProps) {
  const { colors } = useTheme();
  const styles = useStyles();
  const model = useTransactionsMonthListModel(modelArgs);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
      <EmptyState layout="centered" headline={copy.headline} subtext={copy.subtext} />
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
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.subtitle}>
            {`${model.transactionCountLabel} transaction${model.transactionCountIsPlural ? "s" : ""} · ${model.monthLabel}`}
          </Text>
        }
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
      <MonthListHeader
        monthLabel={model.monthLabel}
        kindChip={model.kindChip}
        canGoPrevMonth={model.canGoPrevMonth}
        canGoNextMonth={model.canGoNextMonth}
        activeFilterCount={model.activeFilterCount}
        onPrevMonth={model.goPrevMonth}
        onNextMonth={model.goNextMonth}
        onOpenFilters={() => setFiltersOpen(true)}
        onSelectKind={model.selectKindChip}
      />
      {body}
      {filtersOpen ? (
        <TransactionFilterSheet
          initial={modelArgs.criteria}
          onCancel={() => setFiltersOpen(false)}
          onApply={(next) => {
            modelArgs.onCriteriaChange(next);
            setFiltersOpen(false);
          }}
        />
      ) : null}
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
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  chipScroll: {
    flex: 1,
  },
  chipRow: {
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  chipSelected: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  chipTextSelected: {
    color: colors.onAccent,
  },
  filtersButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceSunken,
  },
  filtersButtonText: {
    fontFamily: fontFamilies.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.accentText,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 14,
    color: colors.onAccent,
  },
  content: {
    paddingTop: spacing.sm,
    paddingBottom: FLOATING_BUTTONS_CLEARANCE,
  },
  subtitle: {
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    paddingBottom: spacing.lg,
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
