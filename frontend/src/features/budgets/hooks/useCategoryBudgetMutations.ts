import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteCategoryBudget,
  upsertCategoryBudget,
} from "../api/categoryBudgetsApi";
import { categoryBudgetsQueryKey } from "./useCategoryBudgetsQuery";

export function useUpsertCategoryBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      monthlyAmount,
    }: {
      categoryId: string;
      monthlyAmount: number;
    }) => upsertCategoryBudget(categoryId, monthlyAmount),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoryBudgetsQueryKey }),
  });
}

export function useDeleteCategoryBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategoryBudget(categoryId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoryBudgetsQueryKey }),
  });
}
