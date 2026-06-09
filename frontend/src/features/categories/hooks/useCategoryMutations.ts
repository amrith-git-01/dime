import { useMutation, useQueryClient } from "@tanstack/react-query";

import { categoryBudgetsQueryKey } from "@/features/budgets/hooks/useCategoryBudgetsQuery";
import { transactionsQueryKeys } from "@/features/transactions/queryKeys";

import { createCategory } from "../api/categoriesApi";
import { deleteCategory } from "../api/categoryDeleteApi";
import {
  patchCategory,
  type UpdateCategoryPayload,
} from "../api/categoryMutationsApi";
import { categoriesQueryKeys } from "../queryKeys";

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.all,
      });
    },
  });
}

export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      payload,
    }: {
      categoryId: string;
      payload: UpdateCategoryPayload;
    }) => patchCategory(categoryId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.all,
      });
    },
  });
}

export type DeleteCategoryVariables = {
  categoryId: string;
  reassignToCategoryId?: string;
};

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      reassignToCategoryId,
    }: DeleteCategoryVariables) =>
      deleteCategory(categoryId, reassignToCategoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: categoryBudgetsQueryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: transactionsQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.deleteImpactAll(),
      });
    },
  });
}
