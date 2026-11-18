import {
  addPendingToMonthTotals,
  pendingTotals,
  type PendingTransactionRow,
} from "@/features/outbox/utils/pendingMerge";

import type { InsightsSummary } from "../types";

/**
 * The month's insights totals with the entries still waiting in the outbox laid over them, by the same rule as
 * Home / Budgets / Transactions (`pendingTotals`): so every screen shows the same spend for the same month.
 */
export function withPendingInsightsSummary(
  summary: InsightsSummary | undefined,
  pending: readonly PendingTransactionRow[],
): InsightsSummary | undefined {
  if (!summary || pending.length === 0) {
    return summary;
  }
  return { ...summary, ...addPendingToMonthTotals(summary, pendingTotals(pending)) };
}
