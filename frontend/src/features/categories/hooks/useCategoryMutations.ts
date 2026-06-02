import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteCategoryFromLocal,
  upsertCategoryFromApi,
} from "@/db/categoriesRepo";
import { categoryBudgetsQueryKey } from "@/features/budgets/hooks/useCategoryBudgetsQuery";

import { transactionsQueryKeys } from "@/features/transactions/queryKeys";
import { deleteCategory } from "../api/categoryDeleteApi";
import {
  patchCategory,
  type UpdateCategoryPayload,
} from "../api/categoryMutationsApi";
import { categoriesQueryKeys } from "../queryKeys";

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
    onSuccess: async (row) => {
      await upsertCategoryFromApi(row);
      await queryClient.invalidateQueries({
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
    onSuccess: async (_void, { categoryId }) => {
      await deleteCategoryFromLocal(categoryId);
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.all,
      });
      await queryClient.invalidateQueries({
        queryKey: categoryBudgetsQueryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKeys.all,
      });
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.deleteImpactAll(),
      });
    },
  });
}
