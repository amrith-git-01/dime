import { useMutation, useQueryClient } from "@tanstack/react-query";

import { upsertCategoryFromApi } from "@/db/categoriesRepo";

import { createCategory } from "../api/categoriesApi";
import { categoriesQueryKeys } from "../queryKeys";

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCategory,
    onSuccess: async (row) => {
      await upsertCategoryFromApi(row);
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKeys.all,
      });
    },
  });
}
