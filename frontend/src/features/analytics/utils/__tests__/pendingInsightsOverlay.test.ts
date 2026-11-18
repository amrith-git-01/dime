import type { PendingTransactionRow } from "@/features/outbox/utils/pendingMerge";

import type { InsightsSummary } from "../../types";
import { withPendingInsightsSummary } from "../pendingInsightsOverlay";

const summary: InsightsSummary = {
  credit_total: "1000.00",
  debit_total: "600.00",
  net: "400.00",
  transaction_count: 3,
  budget_spent: "600.00",
};

function pending(over: Partial<PendingTransactionRow>): PendingTransactionRow {
  return {
    id: "optimistic-manual-1",
    amount: "250.00",
    type: "debit",
    kind: "spend",
    counterparty_type: "merchant",
    transaction_at: "2026-10-23T09:30:00.000Z",
    pending: true,
    outboxId: "optimistic-manual-1",
    ...over,
  } as PendingTransactionRow;
}

describe("withPendingInsightsSummary", () => {
  it("adds waiting spend and income to the month's totals and count", () => {
    const next = withPendingInsightsSummary(summary, [
      pending({}),
      pending({ id: "optimistic-manual-2", type: "credit", kind: "income", amount: "100.00" }),
    ]);
    expect(next).toMatchObject({
      debit_total: "850.00",
      credit_total: "1100.00",
      net: "250.00",
      transaction_count: 5,
      budget_spent: "600.00",
    });
  });

  it("leaves a transfer out of both totals (like the server) but counts it", () => {
    const next = withPendingInsightsSummary(summary, [pending({ kind: "transfer" })]);
    expect(next).toMatchObject({ debit_total: "600.00", credit_total: "1000.00", transaction_count: 4 });
  });

  it("returns the summary untouched without waiting entries, and undefined without a summary", () => {
    expect(withPendingInsightsSummary(summary, [])).toBe(summary);
    expect(withPendingInsightsSummary(undefined, [pending({})])).toBeUndefined();
  });
});
