import type { TransactionRow } from "../types";

/** Matches backend `insights.service._normalize_payee_key`. */
export function normalizePayeeKey(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  const spaced = lowered.replace(/[^a-z0-9]+/g, " ");
  const normalized = spaced.replace(/\s+/g, " ").trim();
  return normalized || "unknown";
}

export function transactionPayeeKey(transaction: TransactionRow): string {
  const normalized = transaction.counterparty_normalized?.trim();
  if (normalized) {
    return normalized;
  }
  const name =
    transaction.counterparty_name?.trim() || transaction.merchant?.trim();
  if (name) {
    return normalizePayeeKey(name);
  }
  return "unknown";
}

export function resolvePayeeFilterId(input: {
  payeeId?: string;
  payeeKey?: string;
}): string {
  const id = input.payeeId?.trim() || input.payeeKey?.trim();
  return id ?? "";
}

/** `debit` lists what was paid to a payee ("Who you paid"); `credit` what a payer sent ("Who paid you"). */
export type PayeeDirection = "debit" | "credit";

export function filterTransactionsByPayee(
  transactions: TransactionRow[],
  payeeKey: string,
  topPayeeKeys: string[] = [],
  direction: PayeeDirection = "debit",
): TransactionRow[] {
  const sameType = transactions.filter((tx) => tx.type === direction);
  if (payeeKey === "__other__") {
    const exclude = new Set(topPayeeKeys);
    return sameType.filter((tx) => !exclude.has(transactionPayeeKey(tx)));
  }
  return sameType.filter((tx) => transactionPayeeKey(tx) === payeeKey);
}
