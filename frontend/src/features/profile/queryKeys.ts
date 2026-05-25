export const profileQueryKeys = {
  all: ["profile"] as const,
  current: (userId: string | undefined) =>
    [...profileQueryKeys.all, "current", userId ?? "anonymous"] as const,
};
