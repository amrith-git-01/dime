import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { CompositeNavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { useBentoMonthSelection } from "@/components/bento";
import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import type { BudgetMonthBentoSummary } from "@/features/budgets/components";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { useCategoryBudgetsQuery } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { buildBudgetCategoryRows } from "./buildBudgetCategoryRows";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useCategories } from "@/features/categories/hooks/useCategories";
import { useRecurringMonthQuery } from "@/features/recurring/hooks/useRecurringMonthQuery";
import { useToast } from "@/features/toast/useToast";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import {
  useMonthDebitTotalsByCategoryQuery,
  useMonthSummaryQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { MainStackParamList, MainTabParamList } from "@/navigation/types";
import { formatInrCompact } from "@/utils/currency";
import { toPaise } from "@/utils/paise";

export const UNCATEGORIZED_SPEND_KEY = UNCATEGORIZED_CATEGORY_KEY;

type BudgetScreenNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Budgets">,
  NativeStackNavigationProp<MainStackParamList>
>;

export function useBudgetScreenModel() {
  const stackNavigation = useNavigation<BudgetScreenNavigation>();
  const { showToast } = useToast();
  const { categories, isLoading: categoriesLoading } = useCategories();

  const {
    monthOptions,
    selectedMonth,
    selectMonth: handleSelectBudgetMonth,
  } = useBentoMonthSelection();

  const selectedMonthIndex = useMemo(
    () => monthOptions.findIndex((m) => m.label === selectedMonth.label),
    [monthOptions, selectedMonth.label],
  );
  const canGoPrevMonth = selectedMonthIndex < monthOptions.length - 1;
  const canGoNextMonth = selectedMonthIndex > 0;
  const goPrevMonth = useCallback(() => {
    if (canGoPrevMonth) handleSelectBudgetMonth(selectedMonthIndex + 1);
  }, [canGoPrevMonth, handleSelectBudgetMonth, selectedMonthIndex]);
  const goNextMonth = useCallback(() => {
    if (canGoNextMonth) handleSelectBudgetMonth(selectedMonthIndex - 1);
  }, [canGoNextMonth, handleSelectBudgetMonth, selectedMonthIndex]);

  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const { data: categoryBudgets = [] } = useCategoryBudgetsQuery();
  const monthSummaryQuery = useMonthSummaryQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const recurringMonthQuery = useRecurringMonthQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const { data: spendByCategoryQuery = {}, isPending: isMonthSpendPending } =
    useMonthDebitTotalsByCategoryQuery(
      selectedMonth.year,
      selectedMonth.monthIndex0,
    );

  const categoryCapById = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of categoryBudgets) {
      const amount = Number.parseFloat(row.monthly_amount);
      if (Number.isFinite(amount) && amount > 0) {
        map.set(row.category_id, amount);
      }
    }
    return map;
  }, [categoryBudgets]);

  const budgetListKey = `${selectedMonth.year}-${selectedMonth.monthIndex0}`;
  const budgetMonthly = budgetResp?.budget?.monthly_budget ?? null;
  const existingBudget = budgetMonthly ? Number.parseFloat(budgetMonthly) : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  // Posted subscriptions and bills keep their recurring category, which the spend list does not carry.
  const spentCategoryMetaById = useMemo(
    () =>
      new Map(
        (monthSummaryQuery.data?.category_meta ?? []).map((m) => [m.id.toLowerCase(), m]),
      ),
    [monthSummaryQuery.data?.category_meta],
  );

  const budgetItems = useMemo(
    (): CategorySpendRowData[] =>
      buildBudgetCategoryRows({
        categories,
        spendByCategory: spendByCategoryQuery,
        categoryCapById,
        spentCategoryMetaById,
      }),
    [categories, spendByCategoryQuery, categoryCapById, spentCategoryMetaById],
  );

  const navigateToBudgetEditor = useCallback(
    (mode: "create" | "edit") => {
      stackNavigation.navigate("EditMonthlyBudget", {
        mode,
        selectedYear: selectedMonth.year,
        selectedMonthIndex0: selectedMonth.monthIndex0,
      });
    },
    [selectedMonth.monthIndex0, selectedMonth.year, stackNavigation],
  );

  const handleSetBudget = useCallback(() => {
    navigateToBudgetEditor("create");
  }, [navigateToBudgetEditor]);
  const handleEditBudget = useCallback(() => {
    navigateToBudgetEditor("edit");
  }, [navigateToBudgetEditor]);

  const handleEditCategory = useCallback(
    (categoryId: string) => {
      stackNavigation.navigate("EditCategory", { categoryId });
    },
    [stackNavigation],
  );

  const openCategoryTransactions = useCallback(
    (item: CategorySpendRowData) => {
      stackNavigation.navigate("TransactionsList", {
        filter: "category",
        year: selectedMonth.year,
        monthIndex0: selectedMonth.monthIndex0,
        categoryId: item.id,
        categoryDisplayName: item.name,
      });
    },
    [selectedMonth.monthIndex0, selectedMonth.year, stackNavigation],
  );

  const spentMonthNum = monthSummaryQuery.data
    ? Math.abs(Number.parseFloat(monthSummaryQuery.data.debit_total))
    : Number.NaN;
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const monthSummaryFailed = monthSummaryQuery.isError;
  // keepPreviousData serves the prior month while the new month fetches — same
  // pattern as Analytics (useAnalyticsScreenModel).
  const isMonthDataTransitioning = monthSummaryQuery.isPlaceholderData;

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
  const usagePercentUsed =
    hasMonthlyBudget &&
    hasSpentMonth &&
    !monthSummaryFailed &&
    monthlyBudgetAmount > 0
      ? Math.round((spentMonthNum / monthlyBudgetAmount) * 100)
      : 0;
  const usageLabel = isOverBudget
    ? "Over budget"
    : hasMonthlyBudget && hasSpentMonth
      ? `${usagePercentUsed}% used`
      : hasMonthlyBudget
        ? "0% used"
        : "No budget set";

  const summaryLoading =
    (monthSummaryQuery.isPending && !monthSummaryQuery.data) ||
    isMonthDataTransitioning ||
    (isBudgetLoading && budgetResp === undefined);

  const monthSplit = monthSummaryQuery.data;
  const fixedPaise = toPaise(monthSplit?.fixed_debit_total);
  const flexiblePaise = toPaise(monthSplit?.flexible_debit_total);
  const upcomingPaise = toPaise(
    recurringMonthQuery.data?.totals.fixed_expense_upcoming,
  );
  const splitLine =
    fixedPaise > 0
      ? `Fixed ${formatInrCompact(fixedPaise / 100)} · Flexible ${formatInrCompact(flexiblePaise / 100)}`
      : null;
  const upcomingLine =
    upcomingPaise > 0
      ? `${formatInrCompact(upcomingPaise / 100)} fixed still to come`
      : null;

  const monthSummary: BudgetMonthBentoSummary | null =
    summaryLoading || monthSummaryFailed
      ? null
      : {
          budgetDisplay: formatInrCompact(monthlyBudgetAmount),
          spentDisplay: hasSpentMonth
            ? formatInrCompact(spentMonthNum)
            : "\u2014",
          remainingDisplay: formatInrCompact(remainingValue),
          spentValue: hasSpentMonth ? spentMonthNum : 0,
          budgetValue: monthlyBudgetAmount,
          remainingValue,
          isOverBudget,
          overageDisplay: formatInrCompact(overageValue),
          usagePct,
          usagePercentUsed,
          usageLabel,
          splitLine,
          upcomingLine,
        };

  const categoriesStillLoading = categoriesLoading && categories.length === 0;
  const isListLoading =
    categoriesStillLoading ||
    isMonthDataTransitioning ||
    (isMonthSpendPending &&
      !monthSummaryQuery.data &&
      Object.keys(spendByCategoryQuery).length === 0);
  const listData = isListLoading ? [] : budgetItems;

  const listExtraData = useMemo(
    () => ({
      hasMonthlyBudget,
      monthlyBudgetAmount,
      monthKey: selectedMonth.label,
    }),
    [hasMonthlyBudget, monthlyBudgetAmount, selectedMonth.label],
  );

  const customCategoryCount = useMemo(
    () => categories.filter((category) => !category.is_system).length,
    [categories],
  );
  const addCustomCategoryDisabled =
    customCategoryCount >= MAX_CUSTOM_CATEGORIES;

  const handleAddCustomCategory = useCallback(() => {
    if (addCustomCategoryDisabled) {
      showToast({
        variant: "error",
        message: `Maximum ${MAX_CUSTOM_CATEGORIES} custom categories`,
      });
      return;
    }
    stackNavigation.navigate("CreateCustomCategory", { origin: "budget" });
  }, [addCustomCategoryDisabled, showToast, stackNavigation]);

  return {
    addCustomCategoryDisabled,
    budgetListKey,
    canGoPrevMonth,
    canGoNextMonth,
    goPrevMonth,
    goNextMonth,
    handleAddCustomCategory,
    handleEditBudget,
    handleEditCategory,
    openCategoryTransactions,
    handleSelectBudgetMonth,
    handleSetBudget,
    hasMonthlyBudget,
    isListLoading,
    listData,
    listExtraData,
    monthOptions,
    monthSummary,
    monthSummaryFailed,
    monthlyBudgetAmount,
    selectedMonth,
    summaryLoading,
  };
}
