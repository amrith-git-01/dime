import type { QueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

import type { BudgetGetResponse } from "@/features/budgets/api/budgetsApi";
import type { CategoryBudgetItem } from "@/features/budgets/api/categoryBudgetsApi";
import {
  budgetQueryKeys,
  categoryBudgetsQueryKeys,
} from "@/features/budgets/queryKeys";
import { computeMonthlyBudgetMath } from "@/features/home/utils/monthlyBudgetMath";
import { UNCATEGORIZED_CATEGORY_KEY } from "@/features/transactions/constants/uncategorizedCategoryKey";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import type { HomeOverview } from "@/features/transactions/types";
import { toPaise } from "@/utils/paise";

import type { WidgetSnapshot } from "./widgetSnapshotMmkv";

const MAX_RECENT = 3;
const MAX_CATEGORIES = 3;

/** Rupees from an API decimal string, exact to the paisa, never negative. */
function rupees(value: string | undefined): number {
  return Math.abs(toPaise(value)) / 100;
}

/**
 * Builds the widget snapshot from what React Query already holds for `userId`. Pure with respect
 * to the cache: it never fetches. Returns null until the home overview is cached, so the widgets
 * keep the last good snapshot instead of an empty one.
 */
export function buildWidgetSnapshot(input: {
  queryClient: QueryClient;
  userId: string;
  timezone: string;
}): Omit<WidgetSnapshot, "version"> | null {
  const { queryClient, userId, timezone } = input;
  const homeKey = transactionsQueryKeys.home(userId, timezone);
  const overview = queryClient.getQueryData<HomeOverview>(homeKey);
  if (!overview) {
    return null;
  }
  // No fetch time means we cannot tell which month the totals describe: keep the last snapshot.
  const updatedAt = queryClient.getQueryState(homeKey)?.dataUpdatedAt;
  if (!updatedAt) {
    return null;
  }
  const fetchedAt = new Date(updatedAt);

  const budget = queryClient.getQueryData<BudgetGetResponse>(
    budgetQueryKeys.current(userId),
  )?.budget;
  const math = computeMonthlyBudgetMath(
    budget?.monthly_budget,
    overview.spent_this_month,
  );

  const categoryBudgets = new Map(
    (
      queryClient.getQueryData<CategoryBudgetItem[]>(
        categoryBudgetsQueryKeys.list(userId),
      ) ?? []
    ).map((item) => [item.category_id, rupees(item.monthly_amount)]),
  );

  return {
    userId,
    updatedAt,
    monthKey: format(fetchedAt, "yyyy-MM"),
    dayKey: format(fetchedAt, "yyyy-MM-dd"),
    spentThisMonth: rupees(overview.spent_this_month),
    recurringSpent: rupees(overview.fixed_spent_this_month),
    flexibleSpent: rupees(overview.flexible_spent_this_month),
    monthlyBudget: math.hasMonthlyBudget ? math.monthlyBudget : null,
    budgetLeft:
      math.hasMonthlyBudget && Number.isFinite(math.monthlyLeft)
        ? math.monthlyLeft
        : null,
    spentToday: rupees(overview.spent_today),
    recentTransactions: (overview.recent_transactions ?? [])
      .slice(0, MAX_RECENT)
      .map((tx) => ({
        id: tx.id,
        name: tx.merchant || tx.counterparty_name?.trim() || "—",
        amount: rupees(tx.amount),
        type: tx.type,
      })),
    topCategories: (overview.top_categories ?? [])
      .slice(0, MAX_CATEGORIES)
      .map((row) => ({
        id: row.category_id ?? UNCATEGORIZED_CATEGORY_KEY,
        name: row.name,
        color: row.color ?? null,
        iconName: row.icon_name ?? null,
        spent: rupees(row.total),
        budget: (row.category_id && categoryBudgets.get(row.category_id)) || null,
      })),
  };
}
