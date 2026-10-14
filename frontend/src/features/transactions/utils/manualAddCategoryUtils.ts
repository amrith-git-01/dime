import { categoryDefault } from "@/constants/colors";
import type { CategoryRow, CategoryScope } from "@/features/categories/types";

import type { TransactionRow, TransactionType } from "../types";

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

const RECURRING_SCOPE_BY_TYPE: Record<TransactionType, CategoryScope> = {
  credit: "recurring_income",
  debit: "recurring_expense",
};

/**
 * The category of a transaction posted by a recurring item (e.g. Salary, Subscriptions). Those live in
 * the recurring scopes, so the spend-scoped picker list never carries them. Built from the transaction's
 * own category fields; null when the category is in the list already or the row has none.
 */
export function recurringCategoryOfTransaction(
  transaction: TransactionRow | undefined,
  categories: CategoryRow[],
): CategoryRow | null {
  const id = transaction?.category_id;
  const name = transaction?.category?.trim();
  if (!transaction || !id || !name) {
    return null;
  }
  if (categories.some((category) => category.id === id)) {
    return null;
  }
  return {
    id,
    name,
    icon_name: transaction.category_icon_name ?? "Package",
    color: transaction.category_color ?? categoryDefault,
    is_system: true,
    scope: RECURRING_SCOPE_BY_TYPE[transaction.type],
    created_at: transaction.created_at,
  };
}

/** A recurring category only fits the transaction type it was posted with (income vs expense). */
export function isRecurringCategoryAllowedForTxType(
  category: CategoryRow,
  txType: TransactionType,
): boolean {
  return category.scope === RECURRING_SCOPE_BY_TYPE[txType];
}

export type EditCategoryReconcileAction =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "select"; category: CategoryRow };

/** What the edit screen does with the selected category after the type or the lists change. */
export function reconcileEditCategory(input: {
  categories: CategoryRow[];
  categoryId: string | null;
  txType: TransactionType;
  recurringCategory: CategoryRow | null;
}): EditCategoryReconcileAction {
  const { categories, categoryId, txType, recurringCategory } = input;
  if (categories.length === 0) {
    return { kind: "keep" };
  }
  const isRecurringSelected =
    recurringCategory !== null && categoryId === recurringCategory.id;
  if (
    isRecurringSelected &&
    isRecurringCategoryAllowedForTxType(recurringCategory, txType)
  ) {
    return { kind: "keep" };
  }
  const current = categoryId
    ? categories.find((category) => category.id === categoryId)
    : undefined;
  if (txType === "credit") {
    if (current && isCategoryAllowedForTxType(current, "credit")) {
      return { kind: "keep" };
    }
    // An id outside the list (a category just created) is kept; a recurring one of the wrong type is not.
    if (categoryId && !current && !isRecurringSelected) {
      return { kind: "keep" };
    }
    const income = findIncomeCategory(categories);
    return income ? { kind: "select", category: income } : { kind: "clear" };
  }
  if (isRecurringSelected) {
    return { kind: "clear" };
  }
  if (current && !isCategoryAllowedForTxType(current, "debit")) {
    return { kind: "clear" };
  }
  return { kind: "keep" };
}

/** Pills the edit screen offers: the type's spend categories, led by the row's own recurring category when it fits. */
export function editVisibleCategories(input: {
  categories: CategoryRow[];
  txType: TransactionType;
  recurringCategory: CategoryRow | null;
}): CategoryRow[] {
  const { categories, txType, recurringCategory } = input;
  let list: CategoryRow[];
  if (txType === "credit") {
    const income = findIncomeCategory(categories);
    list = income ? [income] : categories;
  } else {
    list = categories.filter((category) => category.name !== "Income");
  }
  return recurringCategory &&
    isRecurringCategoryAllowedForTxType(recurringCategory, txType)
    ? [recurringCategory, ...list]
    : list;
}
