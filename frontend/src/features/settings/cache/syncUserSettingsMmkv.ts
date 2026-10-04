import type { QueryClient } from "@tanstack/react-query";

import { readPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";

import { settingsQueryKeys } from "../queryKeys";

export function hydrateUserSettingsFromMmkv(
  queryClient: QueryClient,
  userId: string | undefined,
): boolean {
  const settings = readPersistedUserSettings(userId);
  if (!settings || !userId) {
    return false;
  }
  queryClient.setQueryData(settingsQueryKeys.user(userId), settings);
  return true;
}
