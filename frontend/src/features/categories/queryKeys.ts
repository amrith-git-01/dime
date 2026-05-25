export const categoriesQueryKeys = {
  all: ["categories"] as const,
  list: () => [...categoriesQueryKeys.all, "list"] as const,
};
