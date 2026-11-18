import { useCallback, useState } from "react";

import { resolvePresetTransactionAt } from "@/utils/dateTime";
import { paiseToAmountString, parseAmountInputToPaise } from "@/utils/paise";

import type { CreateTransactionBody } from "../api/transactionsApi";
import {
  DEFAULT_COUNTERPARTY_TYPE,
  type CounterpartyType,
} from "../counterpartyTypes";
import type { TransactionKind, TransactionType } from "../types";
import { defaultKindFor } from "../utils/transactionKind";
import type { ManualAddFormSnapshot } from "../utils/transactionRowToFormState";

export function useManualAddTransactionForm(
  initial?: ManualAddFormSnapshot,
  /** `yyyy-MM-dd` day to date a new transaction to; ignored when `initial` carries a date. */
  presetDate?: string,
) {
  const [amountText, setAmountText] = useState(initial?.amountText ?? "");
  const [txType, setTxTypeState] = useState<TransactionType>(
    initial?.txType ?? "debit",
  );
  const [kind, setKindState] = useState<TransactionKind>(
    initial?.kind ?? "spend",
  );
  const [counterpartyName, setCounterpartyName] = useState(
    initial?.counterpartyName ?? "",
  );
  const [counterpartyType, setCounterpartyTypeState] = useState<CounterpartyType>(
    initial?.counterpartyType ?? DEFAULT_COUNTERPARTY_TYPE,
  );
  // The catalogue brand picked in the counterparty search box; null for a name typed by hand.
  const [brandId, setBrandId] = useState<string | null>(
    initial?.brandId ?? null,
  );
  const [category, setCategory] = useState(initial?.category ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.categoryId ?? null,
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [transactionAt, setTransactionAt] = useState(
    () => initial?.transactionAt ?? resolvePresetTransactionAt(presetDate),
  );

  /**
   * Spend / Income / Transfer. Picking Spend or Income also sets the direction; a Transfer keeps whichever
   * direction is chosen (money out or money in).
   */
  const setKind = useCallback((next: TransactionKind) => {
    setKindState(next);
    if (next === "spend") {
      setTxTypeState("debit");
    } else if (next === "income" || next === "payback") {
      setTxTypeState("credit");
    }
  }, []);

  /** The direction switch: Expense / Income follow it; a Transfer stays a transfer. */
  const setTxType = useCallback((next: TransactionType) => {
    setTxTypeState(next);
    setKindState((current) =>
      current === "transfer" ? current : next === "debit" ? "spend" : "income",
    );
  }, []);

  /** The Shop / Person / Transfer / Unknown chips: "Transfer" (own account) also makes the entry a transfer. */
  const setCounterpartyType = useCallback(
    (next: CounterpartyType) => {
      setCounterpartyTypeState(next);
      if (next === "self_transfer") {
        setKindState("transfer");
      } else if (counterpartyType === "self_transfer") {
        setKindState((current) =>
          current === "transfer" ? defaultKindFor(txType, next) : current,
        );
      }
    },
    [counterpartyType, txType],
  );

  const applySnapshot = useCallback((snap: ManualAddFormSnapshot) => {
    setAmountText(snap.amountText);
    setTxTypeState(snap.txType);
    setKindState(snap.kind);
    setCounterpartyName(snap.counterpartyName);
    setCounterpartyTypeState(snap.counterpartyType);
    setBrandId(snap.brandId);
    setCategory(snap.category);
    setCategoryId(snap.categoryId);
    setNote(snap.note);
    setTransactionAt(snap.transactionAt);
  }, []);

  const reset = useCallback(() => {
    applySnapshot({
      amountText: "",
      txType: "debit",
      kind: "spend",
      counterpartyName: "",
      counterpartyType: DEFAULT_COUNTERPARTY_TYPE,
      brandId: null,
      category: "",
      categoryId: null,
      note: "",
      transactionAt: resolvePresetTransactionAt(presetDate),
    });
  }, [applySnapshot, presetDate]);

  /** Typing changes the name, so a brand picked earlier no longer applies (the server re-matches the new name). */
  const changeCounterpartyName = useCallback((text: string) => {
    setCounterpartyName(text);
    setBrandId(null);
  }, []);

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
      kind,
      counterparty_name: name,
      counterparty_type: counterpartyType,
      brand_id: brandId,
      category: category.trim() || null,
      category_id: categoryId,
      note: note.trim() || null,
      transaction_at: transactionAt.toISOString(),
    };
  }, [
    amountText,
    brandId,
    category,
    categoryId,
    counterpartyName,
    counterpartyType,
    kind,
    note,
    transactionAt,
    txType,
  ]);

  return {
    amountText,
    setAmountText,
    txType,
    setTxType,
    kind,
    setKind,
    counterpartyName,
    setCounterpartyName,
    changeCounterpartyName,
    counterpartyType,
    setCounterpartyType,
    brandId,
    setBrandId,
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
