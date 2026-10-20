import { useMutation, useQueryClient } from "@tanstack/react-query";

import { askNotificationsInContext } from "@/features/onboarding/utils/askNotificationsInContext";

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
      void askNotificationsInContext(
        "Get a heads-up when a category is close to its budget.",
        qc,
      );
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
