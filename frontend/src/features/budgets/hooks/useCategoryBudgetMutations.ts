import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteCategoryBudget,
  upsertCategoryBudget,
} from "../api/categoryBudgetsApi";
import { invalidateBudgetAlertQueries } from "../cache/invalidateBudgetQueries";
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
    onSuccess: () => {
      invalidateBudgetAlertQueries(qc);
      return qc.invalidateQueries({ queryKey: categoryBudgetsQueryKeys.all });
    },
  });
}

export function useDeleteCategoryBudgetMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategoryBudget(categoryId),
    onSuccess: () => {
      invalidateBudgetAlertQueries(qc);
      return qc.invalidateQueries({ queryKey: categoryBudgetsQueryKeys.all });
    },
  });
}
