export const transactionsQueryKeys = {
  all: ["transactions"] as const,
  list: (userId: string | undefined) =>
    [...transactionsQueryKeys.all, "list", userId ?? "none"] as const,
};
