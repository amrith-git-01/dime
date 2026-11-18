import type { TransactionKind, TransactionRow, TransactionType } from "../types";

/** The kind a row gets when nobody chose one: an own-account transfer is a transfer, otherwise the direction decides. */
export function defaultKindFor(
  type: TransactionType,
  counterpartyType?: string | null,
): TransactionKind {
  if (counterpartyType === "self_transfer") {
    return "transfer";
  }
  return type === "credit" ? "income" : "spend";
}

/** How a row counts. Rows from servers and caches that predate the money model have no `kind`. */
export function kindOf(
  row: Pick<TransactionRow, "kind" | "type" | "counterparty_type">,
): TransactionKind {
  return row.kind ?? defaultKindFor(row.type, row.counterparty_type);
}

/** Transfers are in neither spent nor income: they stay in lists but out of every total. */
export function isTransferRow(
  row: Pick<TransactionRow, "kind" | "type" | "counterparty_type">,
): boolean {
  return kindOf(row) === "transfer";
}

/** The one-word label of a kind in badges and the kind selector. */
export const KIND_LABEL: Record<TransactionKind, string> = {
  spend: "Spend",
  income: "Income",
  transfer: "Transfer",
  payback: "Payback",
};
