import { useMemo } from "react";

import { useCategoriesQuery } from "@/features/categories/hooks/useCategories";
import type { CategoryRow } from "@/features/categories/types";

const NONE: CategoryRow[] = [];

/** Every recurring category (expense and income scopes) the category picker can offer. Stable while the lists are unchanged. */
export function useRecurringCategories(): CategoryRow[] {
  const expense = useCategoriesQuery("recurring_expense").data;
  const income = useCategoriesQuery("recurring_income").data;
  return useMemo(
    () => (expense || income ? [...(expense ?? NONE), ...(income ?? NONE)] : NONE),
    [expense, income],
  );
}
