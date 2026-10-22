import type { MonthInsights } from "@/features/analytics/types";
import type { BudgetGetResponse } from "@/features/budgets/api/budgetsApi";
import type { CategoryBudgetItem } from "@/features/budgets/api/categoryBudgetsApi";
import type { ForecastResponse } from "@/features/forecast/types";
import type {
  RecurringListResponse,
  RecurringMonthResponse,
} from "@/features/recurring/types";
import type {
  HomeOverview,
  MonthSummary,
  TransactionListPage,
} from "@/features/transactions/types";
import type { InfiniteData } from "@tanstack/react-query";

/**
 * "Would this screen show its empty state?" for each previewed query's real data. The sample
 * only stands in when the answer is yes, so a screen that has data of its own is never touched.
 */

export function isHomeOverviewEmpty(data: HomeOverview): boolean {
  return data.recent_transactions.length === 0 && Number(data.spent_this_month) === 0;
}

export function isMonthSummaryEmpty(data: MonthSummary): boolean {
  return data.transaction_count === 0;
}

export function isDebitTotalsEmpty(data: Record<string, number>): boolean {
  return Object.keys(data).length === 0;
}

export function isMonthPagesEmpty(
  data: InfiniteData<TransactionListPage, unknown>,
): boolean {
  return data.pages.every((page) => page.items.length === 0);
}

export function isInsightsDataEmpty(data: MonthInsights): boolean {
  return data.summary.transaction_count === 0;
}

/** No history and nothing spent: the forecast has nothing to say yet. */
export function isForecastEmpty(data: ForecastResponse): boolean {
  return data.historyDays === 0 && Number(data.landing.spentSoFar) === 0;
}

export function isRecurringListEmpty(data: RecurringListResponse): boolean {
  return data.items.length === 0;
}

export function isRecurringMonthEmpty(data: RecurringMonthResponse): boolean {
  return data.items.length === 0;
}

export function isBudgetEmpty(data: BudgetGetResponse): boolean {
  return data.budget === null;
}

export function isCategoryBudgetsEmpty(data: CategoryBudgetItem[]): boolean {
  return data.length === 0;
}
