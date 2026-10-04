export const budgetQueryKeys = {
  all: ["budget"] as const,
  current: (userId: string | undefined) =>
    [...budgetQueryKeys.all, userId ?? "none"] as const,
};

export const categoryBudgetsQueryKeys = {
  all: ["categoryBudgets"] as const,
  list: (userId: string | undefined) =>
    [...categoryBudgetsQueryKeys.all, userId ?? "none"] as const,
};
