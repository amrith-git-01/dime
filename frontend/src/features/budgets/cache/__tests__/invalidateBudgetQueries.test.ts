import { insightsQueryKeys } from "@/features/analytics/queryKeys";
import { recurringQueryKeys } from "@/features/recurring/queryKeys";
import { reminderQueryKeys } from "@/features/reminders/queryKeys";
import { invalidateTransactionAggregates, invalidateTransactionDerivedQueries } from "@/features/transactions/cache/invalidateTransactionQueries";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { createTestQueryClient } from "@/test-utils/testQueryClient";

import { invalidateBudgetAlertQueries } from "../invalidateBudgetQueries";

const TZ = "Asia/Kolkata";
const keys = {
  home: transactionsQueryKeys.home("u1", TZ),
  summary: transactionsQueryKeys.monthSummary("u1", 2026, 10, TZ),
  monthPages: transactionsQueryKeys.monthPages("u1", 2026, 10, TZ),
  detail: transactionsQueryKeys.detail("u1", "t1"),
  insights: [...insightsQueryKeys.all, "month", "u1"] as const,
  recurringMonth: recurringQueryKeys.month("u1", 2026, 9),
  reminders: reminderQueryKeys.list("u1", "open"),
};

function seeded() {
  const qc = createTestQueryClient();
  for (const key of Object.values(keys)) {
    qc.setQueryData(key, {});
  }
  return qc;
}

const stale = (qc: ReturnType<typeof createTestQueryClient>, key: readonly unknown[]) =>
  qc.getQueryState(key)?.isInvalidated === true;

describe("invalidateBudgetAlertQueries", () => {
  it("refetches the month views that carry the budget picture (Home, month summary) and Insights", () => {
    const qc = seeded();
    invalidateBudgetAlertQueries(qc);
    expect(stale(qc, keys.home)).toBe(true);
    expect(stale(qc, keys.summary)).toBe(true);
    expect(stale(qc, keys.insights)).toBe(true);
    // The transaction lists do not change when a cap does.
    expect(stale(qc, keys.monthPages)).toBe(false);
    expect(stale(qc, keys.detail)).toBe(false);
  });
});

describe("transaction invalidation", () => {
  it("after any write that moves money (an offset, a link, a restore, a recurring change), every number built on it refetches", () => {
    const qc = seeded();
    invalidateTransactionDerivedQueries(qc);
    for (const key of Object.values(keys)) {
      expect(stale(qc, key)).toBe(true);
    }
  });

  it("aggregates also refetch reminders (a delete reopens the reminder it paid) and the recurring month, not the patched lists", () => {
    const qc = seeded();
    invalidateTransactionAggregates(qc);
    expect(stale(qc, keys.home)).toBe(true);
    expect(stale(qc, keys.summary)).toBe(true);
    expect(stale(qc, keys.insights)).toBe(true);
    expect(stale(qc, keys.recurringMonth)).toBe(true);
    expect(stale(qc, keys.reminders)).toBe(true);
    expect(stale(qc, keys.monthPages)).toBe(false);
    expect(stale(qc, keys.detail)).toBe(false);
  });
});
