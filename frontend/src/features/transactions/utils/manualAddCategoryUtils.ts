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

/**
 * The recurring categories offered for a transaction type: expense -> recurring_expense, income ->
 * recurring_income. `own` is the row's own recurring category (edit screen), kept in the group even when
 * the lists have not loaded.
 */
export function recurringOptionsForType(input: {
  recurringCategories: readonly CategoryRow[];
  txType: TransactionType;
  own?: CategoryRow | null;
}): CategoryRow[] {
  const { recurringCategories, txType, own } = input;
  const options = recurringCategories.filter((category) =>
    isRecurringCategoryAllowedForTxType(category, txType),
  );
  return own &&
    isRecurringCategoryAllowedForTxType(own, txType) &&
    !options.some((category) => category.id === own.id)
    ? [own, ...options]
    : options;
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
  /** The row's own recurring category (edit screen), if any. */
  recurringCategory: CategoryRow | null;
  /** Every recurring category (both scopes), so a picked one is recognised as such. */
  recurringCategories?: readonly CategoryRow[];
}): EditCategoryReconcileAction {
  const { categories, categoryId, txType, recurringCategory } = input;
  if (categories.length === 0) {
    return { kind: "keep" };
  }
  const selectedRecurring = categoryId
    ? (input.recurringCategories?.find((category) => category.id === categoryId) ??
      (recurringCategory?.id === categoryId ? recurringCategory : undefined))
    : undefined;
  const isRecurringSelected = selectedRecurring !== undefined;
  if (
    selectedRecurring &&
    isRecurringCategoryAllowedForTxType(selectedRecurring, txType)
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

/** Main pills of the category picker: the type's spend categories (recurring ones are a separate group). */
export function visibleSpendCategories(
  categories: CategoryRow[],
  txType: TransactionType,
): CategoryRow[] {
  if (txType === "credit") {
    const income = findIncomeCategory(categories);
    return income ? [income] : categories;
  }
  return categories.filter((category) => category.name !== "Income");
}
