import type { LocalCategory } from "@/features/categories/hooks/useLocalCategories";

import type { TransactionType } from "../types";

export function findIncomeCategory(
  categories: LocalCategory[],
): LocalCategory | undefined {
  return categories.find(
    (category) => category.is_system && category.name === "Income",
  );
}

export function isCategoryAllowedForTxType(
  category: LocalCategory | undefined,
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
