export const categoriesQueryKeys = {
  all: ["categories"] as const,
  list: () => [...categoriesQueryKeys.all, "list"] as const,
  deleteImpact: (categoryId: string) =>
    [...categoriesQueryKeys.all, "delete-impact", categoryId] as const,
  deleteImpactAll: () => [...categoriesQueryKeys.all, "delete-impact"] as const,
};
