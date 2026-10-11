import { useQuery } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  readPersistedUserSettings,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";

import { fetchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";

export function useUserSettingsQuery() {
  const { userId } = useSessionUserId();

  return useQuery({
    queryKey: settingsQueryKeys.user(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const settings = await fetchUserSettings();
      if (userId) {
        writePersistedUserSettings(userId, settings);
      }
      return settings;
    },
    placeholderData: () => readPersistedUserSettings(userId) ?? undefined,
  });
}
