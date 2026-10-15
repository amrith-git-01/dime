import type { TransactionRow } from "@/features/transactions/types";

/** True for a row posted by a recurring item or filed under a recurring category (rent, salary, ...). */
export function isRecurringTransaction(
  tx: Pick<TransactionRow, "recurring_item_id" | "category_scope">,
): boolean {
  return (
    Boolean(tx.recurring_item_id) ||
    (tx.category_scope != null && tx.category_scope !== "spend")
  );
}
