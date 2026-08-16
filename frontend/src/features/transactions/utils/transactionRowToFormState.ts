import {
  DEFAULT_COUNTERPARTY_TYPE,
  type CounterpartyType,
} from "../counterpartyTypes";
import type { TransactionRow, TransactionType } from "../types";

export type ManualAddFormSnapshot = {
  amountText: string;
  txType: TransactionType;
  counterpartyName: string;
  counterpartyType: CounterpartyType;
  category: string;
  categoryId: string | null;
  note: string;
  transactionAt: Date;
};

function amountToFormText(raw: string): string {
  const n = Number.parseFloat(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  if (Math.abs(n - Math.round(n)) < 1e-9) {
    return String(Math.round(n));
  }
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function transactionRowToFormState(
  row: TransactionRow,
): ManualAddFormSnapshot {
  const name = (row.counterparty_name ?? "").trim();
  return {
    amountText: amountToFormText(row.amount),
    txType: row.type === "credit" ? "credit" : "debit",
    counterpartyName: name.length > 0 ? name : row.merchant.trim(),
    counterpartyType: row.counterparty_type || DEFAULT_COUNTERPARTY_TYPE,
    category: (row.category ?? "").trim(),
    categoryId: row.category_id,
    note: (row.note ?? "").trim(),
    transactionAt: new Date(row.transaction_at),
  };
}
