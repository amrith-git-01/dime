export const categoriesQueryKeys = {
  all: ["categories"] as const,
  list: (userId: string | undefined) =>
    [...categoriesQueryKeys.all, "list", userId ?? "none"] as const,
  deleteImpact: (userId: string | undefined, categoryId: string) =>
    [
      ...categoriesQueryKeys.all,
      "delete-impact",
      userId ?? "none",
      categoryId,
    ] as const,
};
