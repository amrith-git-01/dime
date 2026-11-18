import type { TransactionRow } from "../types";

/**
 * Matches the API's `normalizeCounterparty` (api/src/features/transactions/dedupe.ts): lower-case, every run of anything
 * but a letter, a combining mark or a digit (any script) becomes one space. Tamil and Hindi names keep their vowel signs.
 * Built at run time because Unicode property escapes may be missing; the fallback keeps every non-ASCII character
 * (separators are then ASCII only) so a non-Latin name still never collapses to "unknown".
 */
const NON_WORD_RUN: RegExp = (() => {
  try {
    return new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "gu");
  } catch {
    return /[\u0000-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007f]+/g;
  }
})();

export function normalizePayeeKey(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(NON_WORD_RUN, " ")
    .replace(/\s+/g, " ")
    .trim();
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
