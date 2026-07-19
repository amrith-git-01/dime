import type { QueryClient } from "@tanstack/react-query";

import { readPersistedUserSettings } from "@/lib/settings/userSettingsMmkv";

import { settingsQueryKeys } from "../queryKeys";

export function hydrateUserSettingsFromMmkv(queryClient: QueryClient): boolean {
  const settings = readPersistedUserSettings();
  if (!settings) {
    return false;
  }
  queryClient.setQueryData(settingsQueryKeys.user(), settings);
  return true;
}
