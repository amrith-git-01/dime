import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useSessionUserId } from "@/hooks/useSessionUserId";
import {
  readPendingCardLayoutScreens,
  readPersistedUserSettings,
  writePersistedUserSettings,
} from "@/lib/settings/userSettingsMmkv";

import { fetchUserSettings } from "../api/settingsApi";
import { settingsQueryKeys } from "../queryKeys";
import type { UserSettings } from "../types";
import { overlayPendingLayouts } from "../utils/settingsPatchRollback";

/**
 * Settings change on other devices too (the card layouts), and the 24 h app default would hide
 * that until tomorrow: a screen that shows them asks again after a minute.
 */
export const SETTINGS_QUERY_STALE_MS = 60 * 1000;

export function useUserSettingsQuery() {
  const { userId } = useSessionUserId();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: settingsQueryKeys.user(userId),
    enabled: Boolean(userId),
    staleTime: SETTINGS_QUERY_STALE_MS,
    queryFn: async () => {
      // An arranged order the server has not heard about yet stays as it is on this device.
      const settings = overlayPendingLayouts(
        await fetchUserSettings(),
        queryClient.getQueryData<UserSettings>(settingsQueryKeys.user(userId)),
        readPendingCardLayoutScreens(userId),
      );
      if (userId) {
        writePersistedUserSettings(userId, settings);
      }
      return settings;
    },
    placeholderData: () => readPersistedUserSettings(userId) ?? undefined,
  });
}
