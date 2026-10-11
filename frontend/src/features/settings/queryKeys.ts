export const settingsQueryKeys = {
  all: ["settings"] as const,
  user: (userId: string | undefined) =>
    [...settingsQueryKeys.all, "user", userId ?? "none"] as const,
};
