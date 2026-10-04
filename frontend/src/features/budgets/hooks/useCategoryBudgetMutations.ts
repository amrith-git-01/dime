import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteCategoryBudget,
  upsertCategoryBudget,
} from "../api/categoryBudgetsApi";
import { categoryBudgetsQueryKeys } from "../queryKeys";

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
      qc.invalidateQueries({ queryKey: categoryBudgetsQueryKeys.all }),
  });
}

export function useDeleteCategoryBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategoryBudget(categoryId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoryBudgetsQueryKeys.all }),
  });
}
