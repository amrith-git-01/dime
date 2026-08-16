import type { TransactionRow } from "../../types";
import { transactionRowToFormState } from "../transactionRowToFormState";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function row(partial: Partial<TransactionRow>): TransactionRow {
  return {
    id: "tx-1",
    user_id: "user-1",
    amount: "500.00",
    type: "debit",
    counterparty_name: "Swiggy",
    counterparty_type: "merchant",
    counterparty_normalized: "swiggy",
    merchant: "Swiggy",
    category: "Food",
    category_id: "cat-food",
    category_icon_name: null,
    category_color: null,
    note: null,
    detected_via: "sms",
    transaction_at: "2026-08-02T12:00:00.000Z",
    created_at: "2026-08-02T12:01:00.000Z",
    updated_at: "2026-08-02T12:01:00.000Z",
    deleted_at: null,
    receipt_url: null,
    voice_url: null,
    ...partial,
  };
}

function run(): void {
  const debit = transactionRowToFormState(row({}));
  assert(debit.amountText === "500", "whole rupees drop .00");
  assert(debit.txType === "debit", "debit type");
  assert(debit.counterpartyName === "Swiggy", "payee from counterparty_name");
  assert(debit.category === "Food", "category name");
  assert(debit.categoryId === "cat-food", "category id");
  assert(debit.note === "", "null note becomes empty string");
  assert(
    debit.transactionAt.toISOString() === "2026-08-02T12:00:00.000Z",
    "transaction_at parsed",
  );

  const credit = transactionRowToFormState(
    row({
      amount: "250.50",
      type: "credit",
      note: "salary",
      counterparty_name: null,
      merchant: "Acme",
      category: null,
      category_id: null,
    }),
  );
  assert(credit.amountText === "250.50", "paise keep two decimals");
  assert(credit.txType === "credit", "credit type");
  assert(credit.counterpartyName === "Acme", "fallback merchant");
  assert(credit.note === "salary", "note kept");
  assert(credit.category === "", "null category empty");
  assert(credit.categoryId === null, "null category id");

  console.log("transactionRowToFormState tests passed");
}

run();
