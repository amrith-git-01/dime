import { useCallback, useState } from "react";

import type { CreateTransactionBody } from "../api/transactionsApi";
import type { TransactionType } from "../types";

function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.replace(/,/g, "").trim();
  if (normalized.length === 0) {
    return null;
  }
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.round(n * 100) / 100;
}

export function useManualAddTransactionForm() {
  const [amountText, setAmountText] = useState("");
  const [txType, setTxType] = useState<TransactionType>("debit");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [transactionAt, setTransactionAt] = useState(() => new Date());

  const reset = useCallback(() => {
    setAmountText("");
    setTxType("debit");
    setMerchant("");
    setCategory("");
    setCategoryId(null);
    setNote("");
    setTransactionAt(new Date());
  }, []);

  const buildPayload = useCallback((): CreateTransactionBody | null => {
    const amount = parsePositiveAmount(amountText);
    if (amount === null) {
      return null;
    }
    const m = merchant.trim();
    if (m.length === 0) {
      return null;
    }
    return {
      amount,
      type: txType,
      merchant: m,
      category: category.trim() || null,
      category_id: categoryId,
      note: note.trim() || null,
      transaction_at: transactionAt.toISOString(),
    };
  }, [amountText, category, categoryId, merchant, note, transactionAt, txType]);

  return {
    amountText,
    setAmountText,
    txType,
    setTxType,
    merchant,
    setMerchant,
    category,
    setCategory,
    categoryId,
    setCategoryId,
    note,
    setNote,
    transactionAt,
    setTransactionAt,
    reset,
    buildPayload,
  };
}
