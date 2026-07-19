import { useQuery } from "@tanstack/react-query";

import {
  readPersistedUserSettings,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";

import { fetchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";

export function useUserSettingsQuery() {
  return useQuery({
    queryKey: settingsQueryKeys.user(),
    queryFn: async () => {
      const settings = await fetchUserSettings();
      writePersistedUserSettings(settings);
      return settings;
    },
    placeholderData: () => readPersistedUserSettings() ?? undefined,
  });
}
