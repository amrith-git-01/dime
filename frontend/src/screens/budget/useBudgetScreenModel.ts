import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo } from "react";

import { useBentoMonthSelection } from "@/components/bento";
import type { CategorySpendRowData } from "@/components/categories/CategorySpendBentoRow";
import { colors } from "@/constants";
import type { BudgetMonthBentoSummary } from "@/features/budgets/components";
import { useBudgetQuery } from "@/features/budgets/hooks/useBudget";
import { useCategoryBudgetsQuery } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { MAX_CUSTOM_CATEGORIES } from "@/features/categories/constants/limits";
import { useLocalCategories } from "@/features/categories/hooks/useLocalCategories";
import { useToast } from "@/features/toast/useToast";
import {
  useMonthDebitTotalsByCategoryQuery,
  useMonthSummaryQuery,
} from "@/features/transactions/hooks/useTransactionsOverviewQueries";
import type { MainStackParamList } from "@/navigation/types";
import { formatInrCompact } from "@/utils/currency";

export const UNCATEGORIZED_SPEND_KEY = "__uncategorized__";

export function useBudgetScreenModel() {
  const stackNavigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { showToast } = useToast();
  const { data: categories, loading: categoriesLoading } = useLocalCategories();
  const { data: budgetResp, isPending: isBudgetLoading } = useBudgetQuery();
  const { data: categoryBudgets = [] } = useCategoryBudgetsQuery();

  const {
    monthOptions,
    selectedMonth,
    selectMonth: handleSelectBudgetMonth,
  } = useBentoMonthSelection();

  const monthSummaryQuery = useMonthSummaryQuery(
    selectedMonth.year,
    selectedMonth.monthIndex0,
  );
  const {
    data: spendByCategory = {},
    isPlaceholderData: isMonthSpendPlaceholder,
    isPending: isMonthSpendPending,
    isFetched: isMonthSpendFetched,
  } = useMonthDebitTotalsByCategoryQuery(
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
  const existingBudget = budgetResp?.budget
    ? Number.parseFloat(budgetResp.budget.monthly_budget)
    : 0;
  const hasMonthlyBudget =
    Number.isFinite(existingBudget) && existingBudget > 0;
  const monthlyBudgetAmount = hasMonthlyBudget ? existingBudget : 0;

  const knownCategoryIds = useMemo(
    () => new Set(categories.map((c) => c.id)),
    [categories],
  );

  const budgetItems = useMemo((): CategorySpendRowData[] => {
    const rows: CategorySpendRowData[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
      icon_name: category.icon_name,
      color: category.color,
      spentMonth: spendByCategory[category.id] ?? 0,
      is_system: category.is_system,
      monthlyCap: categoryCapById.get(category.id) ?? null,
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
        monthlyCap: null,
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
          monthlyCap: categoryCapById.get(categoryId) ?? null,
        });
      }
    }

    return rows.sort(
      (a, b) => b.spentMonth - a.spentMonth || a.name.localeCompare(b.name),
    );
  }, [categories, spendByCategory, knownCategoryIds, categoryCapById]);

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
    monthSummaryQuery.isPending ||
    (isBudgetLoading && budgetResp === undefined);

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
          usageLabel,
        };

  const categoriesStillLoading = categoriesLoading && categories.length === 0;
  const isListLoading =
    categoriesStillLoading ||
    isMonthSpendPlaceholder ||
    (isMonthSpendPending && !isMonthSpendFetched);
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
    handleAddCustomCategory,
    handleEditBudget,
    handleEditCategory,
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
