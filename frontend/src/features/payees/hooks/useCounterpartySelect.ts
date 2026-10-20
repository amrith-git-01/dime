import { useCallback } from "react";

import type { CategoryRow } from "@/features/categories/types";
import type { CounterpartyType } from "@/features/transactions/counterpartyTypes";
import type { TransactionType } from "@/features/transactions/types";

import type { CounterpartySelection } from "../types";

type Params = {
  txType: TransactionType;
  categoryId: string | null;
  /** The user's everyday (spend) categories. */
  categories: readonly CategoryRow[];
  setCounterpartyName: (name: string) => void;
  setCounterpartyType: (type: CounterpartyType) => void;
  setBrandId: (id: string | null) => void;
  selectCategory: (id: string, name: string) => void;
};

/**
 * What picking a payee or brand fills into a transaction form: the name, brand and type, and the payee's usual
 * category when it is an expense with no category chosen yet and the category is one of the user's everyday ones.
 */
export function useCounterpartySelect({
  txType,
  categoryId,
  categories,
  setCounterpartyName,
  setCounterpartyType,
  setBrandId,
  selectCategory,
}: Params) {
  return useCallback(
    (selection: CounterpartySelection) => {
      setCounterpartyName(selection.name);
      setBrandId(selection.brandId);
      setCounterpartyType(selection.counterpartyType);
      if (txType !== "debit" || categoryId !== null || !selection.category) {
        return;
      }
      const match = categories.find((row) => row.id === selection.category?.id);
      if (match) {
        selectCategory(match.id, match.name);
      }
    },
    [
      categories,
      categoryId,
      selectCategory,
      setBrandId,
      setCounterpartyName,
      setCounterpartyType,
      txType,
    ],
  );
}
