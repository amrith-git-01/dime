import { useCallback, useState } from "react";

import type { CreateTransactionBody } from "../api/transactionsApi";
import {
  DEFAULT_COUNTERPARTY_TYPE,
  type CounterpartyType,
} from "../counterpartyTypes";
import type { TransactionType } from "../types";
import type { ManualAddFormSnapshot } from "../utils/transactionRowToFormState";

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

export function useManualAddTransactionForm(initial?: ManualAddFormSnapshot) {
  const [amountText, setAmountText] = useState(initial?.amountText ?? "");
  const [txType, setTxType] = useState<TransactionType>(
    initial?.txType ?? "debit",
  );
  const [counterpartyName, setCounterpartyName] = useState(
    initial?.counterpartyName ?? "",
  );
  const [counterpartyType, setCounterpartyType] = useState<CounterpartyType>(
    initial?.counterpartyType ?? DEFAULT_COUNTERPARTY_TYPE,
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.categoryId ?? null,
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [transactionAt, setTransactionAt] = useState(
    () => initial?.transactionAt ?? new Date(),
  );

  const applySnapshot = useCallback((snap: ManualAddFormSnapshot) => {
    setAmountText(snap.amountText);
    setTxType(snap.txType);
    setCounterpartyName(snap.counterpartyName);
    setCounterpartyType(snap.counterpartyType);
    setCategory(snap.category);
    setCategoryId(snap.categoryId);
    setNote(snap.note);
    setTransactionAt(snap.transactionAt);
  }, []);

  const reset = useCallback(() => {
    applySnapshot({
      amountText: "",
      txType: "debit",
      counterpartyName: "",
      counterpartyType: DEFAULT_COUNTERPARTY_TYPE,
      category: "",
      categoryId: null,
      note: "",
      transactionAt: new Date(),
    });
  }, [applySnapshot]);

  const selectCategory = useCallback((id: string, name: string) => {
    setCategoryId(id);
    setCategory(name);
  }, []);

  const clearCategory = useCallback(() => {
    setCategoryId(null);
    setCategory("");
  }, []);

  const buildPayload = useCallback((): CreateTransactionBody | null => {
    const amount = parsePositiveAmount(amountText);
    if (amount === null) {
      return null;
    }
    const name = counterpartyName.trim();
    if (name.length === 0) {
      return null;
    }
    return {
      amount,
      type: txType,
      counterparty_name: name,
      counterparty_type: counterpartyType,
      category: category.trim() || null,
      category_id: categoryId,
      note: note.trim() || null,
      transaction_at: transactionAt.toISOString(),
    };
  }, [
    amountText,
    category,
    categoryId,
    counterpartyName,
    counterpartyType,
    note,
    transactionAt,
    txType,
  ]);

  return {
    amountText,
    setAmountText,
    txType,
    setTxType,
    counterpartyName,
    setCounterpartyName,
    counterpartyType,
    setCounterpartyType,
    category,
    setCategory,
    categoryId,
    setCategoryId,
    note,
    setNote,
    transactionAt,
    setTransactionAt,
    reset,
    applySnapshot,
    selectCategory,
    clearCategory,
    buildPayload,
  };
}
