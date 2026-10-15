import type { CategoryScope } from "./types";

export const categoriesQueryKeys = {
  all: ["categories"] as const,
  list: (userId: string | undefined, scope: CategoryScope = "spend") =>
    [...categoriesQueryKeys.all, "list", userId ?? "none", scope] as const,
  deleteImpact: (userId: string | undefined, categoryId: string) =>
    [
      ...categoriesQueryKeys.all,
      "delete-impact",
      userId ?? "none",
      categoryId,
    ] as const,
};
