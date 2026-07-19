export const settingsQueryKeys = {
  all: ["settings"] as const,
  user: () => [...settingsQueryKeys.all, "user"] as const,
};
