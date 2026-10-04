export const categoriesQueryKeys = {
  all: ["categories"] as const,
  list: (userId: string | undefined) =>
    [...categoriesQueryKeys.all, "list", userId ?? "none"] as const,
  deleteImpact: (categoryId: string) =>
    [...categoriesQueryKeys.all, "delete-impact", categoryId] as const,
  deleteImpactAll: () => [...categoriesQueryKeys.all, "delete-impact"] as const,
};
