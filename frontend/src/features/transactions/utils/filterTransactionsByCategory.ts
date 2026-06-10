import { UNCATEGORIZED_CATEGORY_KEY } from "../constants/uncategorizedCategoryKey";
import type { TransactionRow } from "../types";

export function transactionCategoryKey(transaction: TransactionRow): string {
  const id = transaction.category_id?.trim();
  return id && id.length > 0 ? id : UNCATEGORIZED_CATEGORY_KEY;
}

/** Month debits for a single category (budget drill-down). */
export function filterTransactionsByCategory(
  transactions: TransactionRow[],
  categoryId: string,
): TransactionRow[] {
  return transactions
    .filter((tx) => tx.type === "debit")
    .filter((tx) => transactionCategoryKey(tx) === categoryId)
    .sort(
      (a, b) =>
        new Date(b.transaction_at).getTime() -
        new Date(a.transaction_at).getTime(),
    );
}
