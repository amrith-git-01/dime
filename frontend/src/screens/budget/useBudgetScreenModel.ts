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
import { resolveMonthBudget } from "@/features/budgets/utils/monthBudget";
import { usePendingInMonth } from "@/features/outbox/hooks/usePendingInMonth";
import { pendingTotals } from "@/features/outbox/utils/pendingMerge";
import { isTourSampleId } from "@/features/tourPreview";
import { useSuggestedMonthlyBudget } from "@/features/onboarding/hooks/useSuggestedMonthlyBudget";
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
import { useTourRestorable } from "@/hooks/useTourRestorable";
import { emitTourEvent, tourEventNames } from "@/lib/tour/tourEvents";
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
  const { categories, isLoading: categoriesLoading } = useCategories("spend");

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

  const showCurrentMonth = useCallback(
    () => handleSelectBudgetMonth(0),
    [handleSelectBudgetMonth],
  );

  // The tour may change the month; it puts it back when it ends.
  useTourRestorable("budgets.month", {
    snapshot: () => selectedMonthIndex,
    restore: (index) => handleSelectBudgetMonth(index as number),
  });

  const { data: budgetResp } = useBudgetQuery();
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
  // The selected month's own numbers (a past month keeps the cap it had then) from the server, with the
  // entries still waiting in the outbox that fall in it laid over (the same overlay as Insights / compare).
  const pendingInMonthRows = usePendingInMonth(selectedMonth.year, selectedMonth.monthIndex0);
  const month = resolveMonthBudget(monthSummaryQuery.data, {
    pending: pendingInMonthRows,
    fixedSpend: monthSummaryQuery.data?.fixed_debit_total,
  });
  const hasMonthlyBudget = month.hasBudget;
  const monthlyBudgetAmount = month.budget;
  // The amount typed in profile setup is offered only while no budget is set.
  const storedBudgetSuggestion = useSuggestedMonthlyBudget();
  const suggestedBudget = hasMonthlyBudget ? undefined : storedBudgetSuggestion;

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

  // The guided tour's sample budget is shown, never edited.
  const isSampleBudget = isTourSampleId(budgetResp?.budget?.id ?? "");
  const handleSetBudget = useCallback(() => {
    if (!isSampleBudget) {
      navigateToBudgetEditor("create");
    }
  }, [isSampleBudget, navigateToBudgetEditor]);
  const handleEditBudget = useCallback(() => {
    if (!isSampleBudget) {
      navigateToBudgetEditor("edit");
    }
  }, [isSampleBudget, navigateToBudgetEditor]);

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
      emitTourEvent(tourEventNames.categoryOpened);
    },
    [selectedMonth.monthIndex0, selectedMonth.year, stackNavigation],
  );

  const pendingSpentPaise = pendingTotals(pendingInMonthRows).debitPaise;
  // Total spend of the month (fixed included) for the "no budget" view; the budget numbers are `month`'s.
  const spentMonthNum = monthSummaryQuery.data
    ? (Math.abs(toPaise(monthSummaryQuery.data.debit_total)) + pendingSpentPaise) / 100
    : Number.NaN;
  const hasSpentMonth = Number.isFinite(spentMonthNum);
  const monthSummaryFailed = monthSummaryQuery.isError;
  // keepPreviousData serves the prior month while the new month fetches — same
  // pattern as Analytics (useAnalyticsScreenModel).
  const isMonthDataTransitioning = monthSummaryQuery.isPlaceholderData;

  // Signed: over budget is "₹X over", never a left of 0.
  const isOverBudget = month.isOver;
  const remainingValue = month.left !== null && month.left > 0 ? month.left : 0;
  const overageValue = month.overBy;
  const usagePct = month.usedFraction;
  const usagePercentUsed = month.usedPercent;
  const usageLabel = isOverBudget
    ? "Over budget"
    : hasMonthlyBudget && hasSpentMonth
      ? `${usagePercentUsed}% used`
      : hasMonthlyBudget
        ? "0% used"
        : "No budget set";

  const summaryLoading =
    (monthSummaryQuery.isPending && !monthSummaryQuery.data) ||
    isMonthDataTransitioning;

  const monthSplit = monthSummaryQuery.data;
  const fixedPaise = toPaise(monthSplit?.fixed_debit_total);
  const flexiblePaise = toPaise(monthSplit?.flexible_debit_total);
  const upcomingPaise = toPaise(
    recurringMonthQuery.data?.totals.fixed_expense_upcoming,
  );

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
          // With a budget the bar is the budget: recurring that counts toward it plus everyday spend.
          fixedSpent: hasMonthlyBudget ? month.recurringInBudget : fixedPaise / 100,
          flexibleSpent: hasMonthlyBudget ? month.flexibleInBudget : flexiblePaise / 100,
          budgetLeft: month.left,
          committed: month.committed,
          upcomingRecurring: upcomingPaise / 100,
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
    showCurrentMonth,
    suggestedBudget,
    summaryLoading,
  };
}
