import { useCallback, useState } from "react";

import { resolvePresetTransactionAt } from "@/utils/dateTime";
import { paiseToAmountString, parseAmountInputToPaise } from "@/utils/paise";

import type { CreateTransactionBody } from "../api/transactionsApi";
import {
  DEFAULT_COUNTERPARTY_TYPE,
  type CounterpartyType,
} from "../counterpartyTypes";
import type { TransactionType } from "../types";
import type { ManualAddFormSnapshot } from "../utils/transactionRowToFormState";

export function useManualAddTransactionForm(
  initial?: ManualAddFormSnapshot,
  /** `yyyy-MM-dd` day to date a new transaction to; ignored when `initial` carries a date. */
  presetDate?: string,
) {
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
    () => initial?.transactionAt ?? resolvePresetTransactionAt(presetDate),
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
      transactionAt: resolvePresetTransactionAt(presetDate),
    });
  }, [applySnapshot, presetDate]);

  const selectCategory = useCallback((id: string, name: string) => {
    setCategoryId(id);
    setCategory(name);
  }, []);

  const clearCategory = useCallback(() => {
    setCategoryId(null);
    setCategory("");
  }, []);

  const buildPayload = useCallback((): CreateTransactionBody | null => {
    const amountPaise = parseAmountInputToPaise(amountText);
    if (amountPaise === null) {
      return null;
    }
    const name = counterpartyName.trim();
    if (name.length === 0) {
      return null;
    }
    return {
      amount: paiseToAmountString(amountPaise),
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
