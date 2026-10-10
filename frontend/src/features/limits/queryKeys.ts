export const limitsQueryKeys = {
  all: ["limits"] as const,
  current: (userId: string | undefined) =>
    [...limitsQueryKeys.all, userId ?? "none"] as const,
};
