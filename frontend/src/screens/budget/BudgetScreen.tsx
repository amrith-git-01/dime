import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import {
  BUDGET_MONTH_OPTIONS_COUNT,
  BUDGET_ROW_HEIGHT_SPENT_ONLY,
  BUDGET_ROW_HEIGHT_WITH_PROGRESS,
} from "@/components/budget/bento/budgetBentoTokens";
import { BudgetBentoSkeleton } from "@/components/budget/bento/BudgetBentoSkeleton";
import {
  BudgetCategoryBentoRow,
  type BudgetCategoryRowData,
} from "@/components/budget/bento/BudgetCategoryBentoRow";
import {
  BudgetMonthBentoCard,
  type BudgetMonthBentoSummary,
} from "@/components/budget/bento/BudgetMonthBentoCard";
import { TabScreenShell } from "@/components/layout/TabScreenShell";
import { fontFamilies } from "@/constants/fonts";
import { colors, spacing } from "@/constants/theme";
import { BudgetCategoriesSectionHeader } from "@/features/budgets/components/BudgetCategoriesSectionHeader";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { useToast } from "@/features/toast/useToast";
import { formatInrCompact } from "@/features/transactions/formatAmount";
import {
  useMonthDebitTotalsByCategoryQuery,
  useMonthSummaryQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { MainStackParamList } from "@/navigation/types";
import { buildMonthOptions } from "@/utils/buildMonthOptions";

const UNCATEGORIZED_SPEND_KEY = "__uncategorized__";
const CategoryListSeparator = memo(function CategoryListSeparator() {
  return <View style={styles.separator} />;
});

type BudgetListEmptyProps = {
  loading: boolean;
};

const BudgetListEmpty = memo(function BudgetListEmpty({
  loading,
}: BudgetListEmptyProps) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>
        {loading
          ? "Loading categories..."
          : "No categories yet. Sync categories to see budgets."}
      </Text>
    </View>
  );
});

const BudgetListFooter = memo(function BudgetListFooter() {
  return <View style={styles.listFooter} />;
});

const BUDGET_LIST_DRAW_DISTANCE = Platform.select({
  ios: 280,
  android: 200,
  default: 240,
}) as number;

export default function BudgetScreen() {
  const stackNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { showToast } = useToast();
  const listRef = useRef<FlashListRef<BudgetCategoryRowData>>(null);
  const { data: categories, loading: categoriesLoading } = useLocalCategories();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const monthOptions = useMemo(
    () => buildMonthOptions(BUDGET_MONTH_OPTIONS_COUNT),
    [],
  );
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const selected = monthOptions[selectedMonthIndex] ?? monthOptions[0];

  const monthSummaryQuery = useMonthSummaryQuery(
    selected.year,
    selected.monthIndex0,
  );
  const { data: spendByCategory = {} } = useMonthDebitTotalsByCategoryQuery(
    selected.year,
    selected.monthIndex0,
  );

  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;

  const knownCategoryIds = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories],
  );

  const budgetItems = useMemo((): BudgetCategoryRowData[] => {
    const rows: BudgetCategoryRowData[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon_name: category.icon_name,
      color: category.color,
      spentMonth: spendByCategory[category.id] ?? 0,
      is_system: category.is_system,
    }));

    const uncategorizedSpent = spendByCategory[UNCATEGORIZED_SPEND_KEY] ?? 0;
    if (uncategorizedSpent > 0) {
      rows.push({
        id: UNCATEGORIZED_SPEND_KEY,
        name: "Uncategorized",
        icon_name: "Package",
        color: colors.categoryDefault,
        spentMonth: uncategorizedSpent,
        is_system: true,
      });
    }

    for (const [categoryId, amount] of Object.entries(spendByCategory)) {
      if (categoryId === UNCATEGORIZED_SPEND_KEY || amount <= 0) {
        continue;
      }
      if (!knownCategoryIds.has(categoryId)) {
        rows.push({
          id: categoryId,
          name: "Unknown category",
          icon_name: "Package",
          color: colors.categoryDefault,
          spentMonth: amount,
          is_system: true,
        });
      }
    }

    return rows.sort(
      (a, b) => b.spentMonth - a.spentMonth || a.name.localeCompare(b.name),
    );
  }, [categories, spendByCategory, knownCategoryIds]);

  const handleSelectBudgetMonth = useCallback((index: number) => {
    setSelectedMonthIndex(index);
  }, []);

  useEffect(() => {
    listRef.current?.scrollToTop({ animated: false });
  }, [selectedMonthIndex]);

  const navigateToBudgetEditor = useCallback(
    (mode: "create" | "edit") => {
      stackNavigation.navigate("EditMonthlyBudget", {
        mode,
        selectedYear: selected.year,
        selectedMonthIndex0: selected.monthIndex0,
      });
    },
    [selected.monthIndex0, selected.year, stackNavigation],
  );

  const handleSetBudget = useCallback(() => {
    navigateToBudgetEditor("create");
  }, [navigateToBudgetEditor]);

  const handleEditBudget = useCallback(() => {
    navigateToBudgetEditor("edit");
  }, [navigateToBudgetEditor]);

  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;
  const spentMonthNum = monthSummaryQuery.data
    ? Math.abs(Number.parseFloat(monthSummaryQuery.data.debit_total))
    : Number.NaN;
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const monthSummaryFailed = monthSummaryQuery.isError;
  const isOverBudget =
    hasMonthlyBudget && hasSpentMonth && spentMonthNum > monthlyBudgetAmount;
  const remainingValue =
    hasMonthlyBudget && hasSpentMonth && !monthSummaryFailed
      ? Math.max(0, monthlyBudgetAmount - spentMonthNum)
      : 0;
  const overageValue =
    isOverBudget && hasSpentMonth ? spentMonthNum - monthlyBudgetAmount : 0;
  const usagePct =
    hasMonthlyBudget &&
    hasSpentMonth &&
    !monthSummaryFailed &&
    monthlyBudgetAmount > 0
      ? Math.min(1, spentMonthNum / monthlyBudgetAmount)
      : 0;
  const usageLabel = isOverBudget
    ? "Over budget"
    : hasMonthlyBudget && hasSpentMonth
      ? `${Math.round(usagePct * 100)}% used`
      : hasMonthlyBudget
        ? "0% used"
        : "No budget set";

  const summaryLoading =
    monthSummaryQuery.isPending || (isBudgetLoading && budgetResp === undefined);

  const monthSummary: BudgetMonthBentoSummary | null =
    summaryLoading || monthSummaryFailed
      ? null
      : {
          budgetDisplay: formatInrCompact(monthlyBudgetAmount),
          spentDisplay: hasSpentMonth
            ? formatInrCompact(spentMonthNum)
            : "—",
          remainingDisplay: formatInrCompact(remainingValue),
          spentValue: hasSpentMonth ? spentMonthNum : 0,
          budgetValue: monthlyBudgetAmount,
          remainingValue,
          isOverBudget,
          overageDisplay: formatInrCompact(overageValue),
          usagePct,
          usageLabel,
        };

  const categoriesStillLoading = categoriesLoading && categories.length === 0;

  const showInitialSkeleton =
    isBudgetLoading && budgetResp === undefined && categoriesStillLoading;

  const renderCategory = useCallback(
    ({ item }: { item: BudgetCategoryRowData }) => (
      <BudgetCategoryBentoRow
        item={item}
        hasMonthlyBudget={hasMonthlyBudget}
        monthlyBudgetAmount={monthlyBudgetAmount}
      />
    ),
    [hasMonthlyBudget, monthlyBudgetAmount],
  );

  const listExtraData = useMemo(
    () => ({
      hasMonthlyBudget,
      monthlyBudgetAmount,
      monthKey: selected.label,
    }),
    [hasMonthlyBudget, monthlyBudgetAmount, selected.label],
  );

  const overrideItemLayout = useCallback(
    (
      layout: { span?: number; size?: number },
      _item: BudgetCategoryRowData,
    ) => {
      layout.size = hasMonthlyBudget
        ? BUDGET_ROW_HEIGHT_WITH_PROGRESS
        : BUDGET_ROW_HEIGHT_SPENT_ONLY;
    },
    [hasMonthlyBudget],
  );

  const listEmpty = useMemo(
    () => <BudgetListEmpty loading={categoriesStillLoading} />,
    [categoriesStillLoading],
  );

  const listFooter = useMemo(() => <BudgetListFooter />, []);

  const customCategoryCount = useMemo(
    () => categories.filter((category) => !category.is_system).length,
    [categories],
  );

  const handleAddCustomCategory = useCallback(() => {
    if (customCategoryCount >= MAX_CUSTOM_CATEGORIES) {
      showToast({
        variant: "error",
        message: `Maximum ${MAX_CUSTOM_CATEGORIES} custom categories`,
      });
      return;
    }
    stackNavigation.navigate("CreateCustomCategory", { origin: "budget" });
  }, [customCategoryCount, showToast, stackNavigation]);

  const listSectionHeader = useMemo(
    () => (
      <BudgetCategoriesSectionHeader
        onAddPress={handleAddCustomCategory}
        addDisabled={customCategoryCount >= MAX_CUSTOM_CATEGORIES}
      />
    ),
    [customCategoryCount, handleAddCustomCategory],
  );

  if (showInitialSkeleton) {
    return (
      <TabScreenShell>
        <BudgetBentoSkeleton />
      </TabScreenShell>
    );
  }

  return (
    <TabScreenShell>
      <View style={styles.screen}>
        <View style={styles.summarySlot}>
          <BudgetMonthBentoCard
            selectedMonth={selected.label}
            monthOptions={monthOptions}
            onSelectMonth={handleSelectBudgetMonth}
            hasMonthlyBudget={hasMonthlyBudget}
            summary={monthSummary}
            summaryLoading={summaryLoading}
            summaryFailed={monthSummaryFailed}
            onEditBudget={handleEditBudget}
            onSetBudget={handleSetBudget}
          />
        </View>

        <FlashList
          ref={listRef}
          style={styles.list}
          data={budgetItems}
          extraData={listExtraData}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
          overrideItemLayout={overrideItemLayout}
          drawDistance={BUDGET_LIST_DRAW_DISTANCE}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={CategoryListSeparator}
          ListEmptyComponent={listEmpty}
          ListHeaderComponent={listSectionHeader}
          ListFooterComponent={listFooter}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </TabScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.pageBackground,
  },
  summarySlot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  list: {
    flex: 1,
  },
  listFooter: {
    height: spacing.xl,
  },
  separator: {
    height: spacing.md,
  },
  emptyWrap: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  emptyText: {
    fontFamily: fontFamilies.regular,
    color: colors.textSecondary,
  },
});
