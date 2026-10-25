export const settingsQueryKeys = {
  all: ["settings"] as const,
  user: (userId: string | undefined) =>
    [...settingsQueryKeys.all, "user", userId ?? "none"] as const,
  /** Key of the settings update mutation: lets "is another save running?" be asked per user. */
  update: (userId: string | undefined) =>
    [...settingsQueryKeys.all, "update", userId ?? "none"] as const,
};
