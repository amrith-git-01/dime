import type { CategoryRow } from "@/features/categories/types";

import type { TransactionType } from "../types";

export function findIncomeCategory(
  categories: CategoryRow[],
): CategoryRow | undefined {
  return categories.find(
    (category) => category.is_system && category.name === "Income",
  );
}

export function isCategoryAllowedForTxType(
  category: CategoryRow | undefined,
  txType: TransactionType,
): boolean {
  if (!category) {
    return false;
  }
  if (txType === "credit") {
    return category.is_system && category.name === "Income";
  }
  return category.name !== "Income";
}
